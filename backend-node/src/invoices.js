// invoices.js - Invoice upload & document management (Node.js port of invoices.py).
// Same documented Base64 JSON transfer format and the same security rules:
// - Size limit enforced BEFORE decoding (and on the decoded bytes after).
// - Extension whitelist + magic-byte content verification.
// - 100% server-generated file names (path traversal impossible by construction).
// - Ownership enforced on every operation (users can never touch other users' files).
// - Files are only ever stored and streamed; never executed.
// DSA: Merge Sort orders invoices newest-first; dictionary lookups map
// extensions to MIME types and magic signatures in O(1).

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { mergeSort } from './dsa.js';
import { getProductById } from './products.js';

// ── UPLOAD SECURITY CONFIGURATION ────────────────────────────────────────────
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB hard limit
// Base64 inflates data by 4/3 — enforce the limit on the ENCODED string first.
export const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_SIZE_BYTES / 3) * 4;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');

export const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);

// O(1) dictionary lookups (DSA concept) instead of if/else chains
export const MIME_MAP = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
};

export const MAGIC_BYTES = {
  pdf: [Buffer.from('%PDF', 'latin1')],
  jpg: [Buffer.from([0xff, 0xd8, 0xff])],
  jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  png: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]
};

// ── FILE NAME & PATH SAFETY ──────────────────────────────────────────────────

function generateSafeFileName(userId, productId, extension) {
  // The user's original name NEVER becomes part of the stored path.
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 15);
  const uniqueToken = crypto.randomBytes(6).toString('hex'); // 12 hex chars
  return `invoice_u${userId}_p${productId}_${timestamp}_${uniqueToken}.${extension}`;
}

function resolveStoredPath(filePath) {
  // Defence in depth: even a tampered DB row cannot escape the uploads dir.
  const absolute = path.resolve(UPLOAD_DIR, filePath);
  if (!absolute.startsWith(UPLOAD_DIR + path.sep)) {
    return null;
  }
  return absolute;
}

// ── VALIDATION HELPERS ───────────────────────────────────────────────────────

function extractExtension(fileName) {
  const baseName = path.basename((fileName || '').trim()); // directories discarded
  const parts = baseName.split('.');
  return parts.length < 2 ? '' : parts.pop().toLowerCase();
}

function hasValidSignature(fileBytes, extension) {
  const signatures = MAGIC_BYTES[extension] || [];
  return signatures.some((sig) => fileBytes.subarray(0, sig.length).equals(sig));
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

// Strict Base64 check: only the standard alphabet, correct length and padding.
function isStrictBase64(value) {
  if (!value || value.length % 4 !== 0) {
    return false;
  }
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

// ── RESPONSE SHAPING (keeps JSON keys identical to the Python backend) ───────

function shapeInvoice(invoice) {
  if (!invoice) {
    return null;
  }
  const { product, ...rest } = invoice;
  return { ...rest, product_name: product ? product.name : null };
}

// ── CORE: UPLOAD (Base64 JSON transfer format + duplicate detection) ────────

// ── SHARED FILE VALIDATION (used by upload AND the OCR preview endpoint) ─────

/**
 * Validates the documented Base64 file payload:
 * name required → extension whitelist → encoded size before decode →
 * strict Base64 → decoded size → magic bytes.
 * Returns { success: true, extension, fileBytes } or { success: false, error }.
 */
export function validateFilePayload(data) {
  // 1. Extension whitelist (checks the NAME the user claims).
  const originalName = (data.file_name || '').trim();
  if (!originalName) {
    return { success: false, error: 'A file must be selected before uploading.' };
  }
  const extension = extractExtension(originalName);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      success: false,
      error: 'Unsupported file type. Only PDF, JPG, JPEG and PNG files are allowed.'
    };
  }

  // 2. Size limit enforced on the ENCODED payload BEFORE decoding.
  const fileData = data.file_data || '';
  if (!fileData) {
    return { success: false, error: 'The selected file appears to be empty.' };
  }
  if (fileData.length > MAX_BASE64_LENGTH) {
    return { success: false, error: 'File is too large. Maximum allowed size is 5 MB.' };
  }

  // 3. Decode Base64 safely (strict alphabet check first — Node's Buffer
  //    decoding is lenient by default, so we validate the input ourselves).
  if (!isStrictBase64(fileData)) {
    return { success: false, error: 'The file data is corrupted. Please try uploading again.' };
  }
  const fileBytes = Buffer.from(fileData, 'base64');

  // 4. Real size check on the decoded bytes (the final authority).
  if (fileBytes.length === 0) {
    return { success: false, error: 'The selected file appears to be empty.' };
  }
  if (fileBytes.length > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'File is too large. Maximum allowed size is 5 MB.' };
  }

  // 5. Content verification via magic bytes (never trust the extension).
  if (!hasValidSignature(fileBytes, extension)) {
    return {
      success: false,
      error: 'File content does not match its type. Please upload a genuine PDF or image file.'
    };
  }

  return { success: true, extension, fileBytes, originalName };
}

export async function uploadInvoice(productId, userId, data) {
  // 1. Ownership check: the invoice must attach to a product the user owns.
  const product = await getProductById(productId, userId);
  if (!product) {
    return { success: false, error: 'Product not found or access denied.' };
  }

  // 2-5. Shared validation: whitelist, size limits, Base64, magic bytes.
  const validation = validateFilePayload(data);
  if (!validation.success) {
    return validation;
  }
  const { extension, fileBytes, originalName } = validation;

  // 7. Optional metadata validation + OCR text (captured by the preview step).
  const invoiceNumber = (data.invoice_number || '').trim();
  const seller = (data.seller || '').trim();
  const invoiceDate = (data.invoice_date || '').trim();
  if (invoiceDate && !isValidDateString(invoiceDate)) {
    return { success: false, error: 'Invoice date must use the YYYY-MM-DD format.' };
  }
  const ocrText = typeof data.ocr_text === 'string' ? data.ocr_text.slice(0, 5000) : '';
  const ocrProcessed = ocrText.length > 0;

  // 8. Duplicate check + save happen inside ONE database transaction so a
  //    concurrent identical upload cannot slip between the check and the
  //    insert (SQLite serializes writers; details in docs/INVOICES_API.md).
  //    `force: true` is the user's deliberate "save anyway" exception.
  const duplicateCheckNeeded = !data.force && Boolean(seller && invoiceNumber);
  const storedName = generateSafeFileName(userId, productId, extension);
  const userDirectory = path.join(UPLOAD_DIR, `u${userId}`);
  const absolutePath = path.join(userDirectory, storedName);
  const relativePath = path.join(`u${userId}`, storedName);

  let outcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      if (duplicateCheckNeeded) {
        // COLLATE NOCASE = the seller/invoice-number comparison is case-insensitive
        const existing = await tx.$queryRaw`
          SELECT i.invoice_id, i.invoice_number, i.seller, i.invoice_date,
                 i.original_filename, i.uploaded_at, p.name AS product_name
          FROM Invoices i
          JOIN Products p ON p.product_id = i.product_id
          WHERE p.user_id = ${userId}
            AND i.invoice_number = ${invoiceNumber} COLLATE NOCASE
            AND i.seller = ${seller} COLLATE NOCASE
          LIMIT 1
        `;
        if (existing.length > 0) {
          return { duplicate: existing[0] };
        }
      }

      await fsp.mkdir(userDirectory, { recursive: true });
      await fsp.writeFile(absolutePath, fileBytes);

      const created = await tx.invoices.create({
        data: {
          product_id: productId,
          invoice_number: invoiceNumber || null,
          seller: seller || null,
          invoice_date: invoiceDate || null,
          file_path: relativePath,
          original_filename: path.basename(originalName), // display-only
          file_size: fileBytes.length,
          mime_type: MIME_MAP[extension], // O(1) dictionary lookup
          ocr_text: ocrText || null,
          ocr_processed: ocrProcessed
        },
        include: { product: { select: { name: true } } }
      });
      return { created };
    });
  } catch (err) {
    // Transaction failed (e.g. DB error after the file was written): clean up
    await fsp.unlink(absolutePath).catch(() => {});
    return { success: false, error: `Database insertion failed: ${err.message}` };
  }

  // 9. Duplicate found: do NOT save; hand the existing record back so the UI
  //    can warn the user and let them review it or save anyway explicitly.
  if (outcome.duplicate) {
    return {
      success: false,
      duplicate: true,
      error: `Possible duplicate: an invoice from "${seller}" with number "${invoiceNumber}" already exists. Review it, or confirm to save anyway.`,
      existing_invoice: {
        ...outcome.duplicate,
        uploaded_at: outcome.duplicate.uploaded_at
          ? outcome.duplicate.uploaded_at.toISOString()
          : null
      }
    };
  }

  return {
    success: true,
    message: 'Invoice uploaded successfully.',
    invoice_id: outcome.created.invoice_id,
    invoice: shapeInvoice(outcome.created)
  };
}

// ── QUERIES ──────────────────────────────────────────────────────────────────

export async function getInvoiceById(invoiceId, userId) {
  const invoice = await prisma.invoices.findFirst({
    where: { invoice_id: invoiceId, product: { user_id: userId } },
    include: { product: { select: { name: true } } }
  });
  return shapeInvoice(invoice);
}

export async function getInvoicesForProduct(productId, userId) {
  const invoices = await prisma.invoices.findMany({
    where: { product_id: productId, product: { user_id: userId } },
    include: { product: { select: { name: true } } }
  });
  // DSA: Merge Sort, newest upload first, O(n log n)
  return mergeSort(
    invoices.map(shapeInvoice),
    (inv) => (inv.uploaded_at ? inv.uploaded_at.toISOString() : ''),
    true
  );
}

export async function getAllInvoices(userId) {
  const invoices = await prisma.invoices.findMany({
    where: { product: { user_id: userId } },
    include: { product: { select: { name: true } } }
  });
  return mergeSort(
    invoices.map(shapeInvoice),
    (inv) => (inv.uploaded_at ? inv.uploaded_at.toISOString() : ''),
    true
  );
}

// ── PART E: SEARCH & SORTING (database-level, Prisma + parameterized SQL) ────
//
// Complexity notes (see docs/INVOICES_API.md for the full write-up):
// - Search with LIKE '%q%': O(n) scan over the user's invoices (a B-tree index
//   cannot accelerate a leading-wildcard search), each row matched in O(m).
// - Sort by invoice_date: O(n log n) without an index; with the new
//   Invoices(invoice_date) index SQLite can walk the index in O(n) and skip
//   the sorting step entirely.
// - The DEFAULT listing (no search/sort params) still uses the hand-written
//   DSA Merge Sort (O(n log n)) on uploaded_at — kept for the viva demo.

const SEARCH_FIELDS = new Set(['invoice_number', 'seller', 'product', 'all']);
const SORT_ORDERS = new Set(['date_asc', 'date_desc']);

function shapeRawInvoice(row) {
  return {
    ...row,
    uploaded_at: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : null
  };
}

export async function searchInvoices(userId, { search = '', field = 'all', sort = '' } = {}) {
  const searchValue = String(search || '').trim();
  const searchField = SEARCH_FIELDS.has(field) ? field : 'all';
  const sortOrder = SORT_ORDERS.has(sort) ? sort : '';

  // No search text → plain listing. Pure date-sort goes through Prisma's
  // orderBy (the invoice_date index lets SQLite skip the sort step); no sort
  // param → the default newest-uploaded DSA Merge Sort listing.
  if (!searchValue) {
    if (sortOrder === 'date_asc') {
      const rows = await prisma.invoices.findMany({
        where: { product: { user_id: userId } },
        // nulls: 'last' — invoices without a date never sit at the top
        orderBy: [{ invoice_date: { sort: 'asc', nulls: 'last' } }, { uploaded_at: 'desc' }],
        include: { product: { select: { name: true } } }
      });
      return rows.map(shapeInvoice);
    }
    if (sortOrder === 'date_desc') {
      const rows = await prisma.invoices.findMany({
        where: { product: { user_id: userId } },
        orderBy: [{ invoice_date: { sort: 'desc', nulls: 'last' } }, { uploaded_at: 'desc' }],
        include: { product: { select: { name: true } } }
      });
      return rows.map(shapeInvoice);
    }
    return getAllInvoices(userId);
  }

  // Search mode: one parameterized SQL query does filter + sort together.
  // LIKE with ASCII text is case-insensitive in SQLite by default.
  const like = `%${searchValue}%`;
  let matchClause;
  if (searchField === 'invoice_number') {
    matchClause = Prisma.sql`AND i.invoice_number LIKE ${like}`;
  } else if (searchField === 'seller') {
    matchClause = Prisma.sql`AND i.seller LIKE ${like}`;
  } else if (searchField === 'product') {
    matchClause = Prisma.sql`AND p.name LIKE ${like}`;
  } else {
    matchClause = Prisma.sql`AND (i.invoice_number LIKE ${like} OR i.seller LIKE ${like} OR p.name LIKE ${like})`;
  }

  // invoice_date is stored as YYYY-MM-DD text, so lexicographic order = date order.
  // NULLS LAST keeps undated invoices at the bottom; ties fall back to newest upload.
  const orderClause = sortOrder === 'date_asc'
    ? Prisma.raw('ORDER BY i.invoice_date ASC NULLS LAST, i.uploaded_at DESC')
    : sortOrder === 'date_desc'
      ? Prisma.raw('ORDER BY i.invoice_date DESC NULLS LAST, i.uploaded_at DESC')
      : Prisma.raw('ORDER BY i.uploaded_at DESC');

  const rows = await prisma.$queryRaw`
    SELECT i.invoice_id, i.product_id, i.invoice_number, i.seller, i.invoice_date,
           i.file_path, i.original_filename, i.file_size, i.mime_type, i.uploaded_at,
           p.name AS product_name
    FROM Invoices i
    JOIN Products p ON p.product_id = i.product_id
    WHERE p.user_id = ${userId}
    ${matchClause}
    ${orderClause}
  `;
  return rows.map(shapeRawInvoice);
}

// ── DOWNLOAD SUPPORT ─────────────────────────────────────────────────────────

export async function getInvoiceFile(invoiceId, userId) {
  const invoice = await getInvoiceById(invoiceId, userId);
  if (!invoice) {
    return null;
  }

  const absolutePath = resolveStoredPath(invoice.file_path || '');
  if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }

  return {
    absolute_path: absolutePath,
    mime_type: invoice.mime_type || 'application/octet-stream',
    download_name: path.basename(invoice.original_filename || absolutePath),
    file_size: invoice.file_size || fs.statSync(absolutePath).size
  };
}

// ── EDIT (Part B) ────────────────────────────────────────────────────────────

export async function updateInvoice(invoiceId, userId, data) {
  // 1. Ownership check on the invoice being edited.
  const invoice = await getInvoiceById(invoiceId, userId);
  if (!invoice) {
    return { success: false, error: 'Invoice not found or access denied.' };
  }

  // 2. Re-linking to a different product (optional; keeps current one by default).
  let newProductId = data.product_id !== undefined ? data.product_id : invoice.product_id;
  newProductId = Number(newProductId);
  if (Number.isNaN(newProductId)) {
    return { success: false, error: 'Invalid product ID format.' };
  }
  if (newProductId !== invoice.product_id) {
    const targetProduct = await getProductById(newProductId, userId);
    if (!targetProduct) {
      return { success: false, error: 'Target product not found or access denied.' };
    }
  }

  // 3. Text metadata (missing fields keep current values).
  const invoiceNumber = data.invoice_number !== undefined
    ? String(data.invoice_number).trim()
    : (invoice.invoice_number || '');
  const seller = data.seller !== undefined
    ? String(data.seller).trim()
    : (invoice.seller || '');

  // 4. Date validation (must stay in the shared YYYY-MM-DD format).
  const invoiceDate = data.invoice_date !== undefined
    ? String(data.invoice_date).trim()
    : (invoice.invoice_date || '');
  if (invoiceDate && !isValidDateString(invoiceDate)) {
    return { success: false, error: 'Invoice date must use the YYYY-MM-DD format.' };
  }

  // 5. file_path is SYSTEM-OWNED and never read from client data here —
  //    a malicious client can never re-point an invoice at another file.
  try {
    await prisma.invoices.update({
      where: { invoice_id: invoiceId },
      data: {
        product_id: newProductId,
        invoice_number: invoiceNumber || null,
        seller: seller || null,
        invoice_date: invoiceDate || null
      }
    });
    return {
      success: true,
      message: 'Invoice updated successfully.',
      invoice: await getInvoiceById(invoiceId, userId)
    };
  } catch (err) {
    return { success: false, error: `Update failed: ${err.message}` };
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteInvoice(invoiceId, userId) {
  const invoice = await getInvoiceById(invoiceId, userId);
  if (!invoice) {
    return { success: false, error: 'Invoice not found or access denied.' };
  }

  const absolutePath = resolveStoredPath(invoice.file_path || '');
  if (absolutePath && fs.existsSync(absolutePath)) {
    await fsp.unlink(absolutePath).catch(() => {});
  }

  try {
    await prisma.invoices.delete({ where: { invoice_id: invoiceId } });
    return { success: true, message: 'Invoice deleted successfully.' };
  } catch (err) {
    return { success: false, error: `Deletion failed: ${err.message}` };
  }
}
