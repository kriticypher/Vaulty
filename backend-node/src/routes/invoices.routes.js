// invoices.routes.js - Invoice endpoints (Node.js port of Member 2's routes).
// Same documented Base64 JSON transfer format as the Python backend.

import { Router } from 'express';
import fs from 'node:fs';
import { getUserIdFromRequest } from '../auth.js';
import {
  uploadInvoice,
  searchInvoices,
  exportInvoicesCsv,
  getInvoicesForProduct,
  getInvoiceById,
  getInvoiceFile,
  updateInvoice,
  deleteInvoice,
  validateFilePayload
} from '../invoices.js';
import { extractInvoiceFields } from '../ocr.js';

export const invoices = Router();

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function requireUser(req, res, message = 'Authentication required. Please login.') {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: message });
    return null;
  }
  return userId;
}

// ── GET /api/invoices — list, search (Part E) and sort ───────────────────────
//   ?search=alpha&field=all|invoice_number|seller|product&sort=date_asc|date_desc
invoices.get('/invoices', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const invoices = await searchInvoices(userId, {
    search: req.query.search || '',
    field: req.query.field || 'all',
    sort: req.query.sort || ''
  });
  return res.json({ invoices });
});

// ── POST /api/invoices/ocr-preview — extract fields from a file (Part: OCR) ──
//   Same Base64 JSON envelope as the upload, but nothing is stored: the result
//   is used to pre-fill the upload form, which the user can edit before saving.
invoices.post('/invoices/ocr-preview', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const validation = validateFilePayload(req.body || {});
  if (!validation.success) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const ocr = await extractInvoiceFields(validation.originalName, validation.fileBytes);
  return res.json({ success: true, ocr });
});

// ── GET /api/invoices/export — Part F: CSV download of the user's invoices ───
//   Must stay registered BEFORE '/invoices/:id' so "export" is not read as an id.
invoices.get('/invoices/export', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const csv = await exportInvoicesCsv(userId);
  // UTF-8 BOM keeps Excel/Sheets from mangling non-ASCII sellers.
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vaultly-invoices.csv"');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).send('\uFEFF' + csv);
});

// ── GET /api/products/:id/invoices — invoices linked to one owned product ────
invoices.get('/products/:id/invoices', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const productId = Number(req.params.id);
  if (Number.isNaN(productId)) {
    return res.status(400).json({ error: 'Invalid product ID format.' });
  }
  return res.json({ invoices: await getInvoicesForProduct(productId, userId) });
});

// ── POST /api/products/:id/invoices — Base64 JSON upload ─────────────────────
invoices.post('/products/:id/invoices', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const productId = Number(req.params.id);
  if (Number.isNaN(productId)) {
    return res.status(400).json({ error: 'Invalid product ID format.' });
  }

  const result = await uploadInvoice(productId, userId, req.body || {});
  const statusCode = result.success ? 201 : (result.duplicate ? 409 : 400);
  return res.status(statusCode).json(result);
});

// ── GET /api/invoices/:id/download — stream the stored file ──────────────────
invoices.get('/invoices/:id/download', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const invoiceId = Number(req.params.id);
  if (Number.isNaN(invoiceId)) {
    return res.status(400).json({ error: 'Invalid invoice ID format.' });
  }

  const preview = req.query.preview === '1';
  const file = await getInvoiceFile(invoiceId, userId);
  if (!file) {
    return res.status(404).json({ error: 'Invoice not found or access denied.' });
  }

  // Inline preview is only allowed for server-verified PDF/image types;
  // everything else is forced to download so nothing executes in-browser.
  const inlineOk = preview && ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mime_type);
  const disposition = inlineOk ? 'inline' : 'attachment';
  const safeName = file.download_name.replace(/["\r\n]/g, '');

  res.status(200);
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Length', file.file_size);
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  // Stream in chunks — large files never load fully into memory.
  fs.createReadStream(file.absolute_path).pipe(res);
});

// ── GET /api/invoices/:id — open one invoice's full details ──────────────────
invoices.get('/invoices/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const invoiceId = Number(req.params.id);
  if (Number.isNaN(invoiceId)) {
    return res.status(400).json({ error: 'Invalid invoice ID format.' });
  }

  const invoice = await getInvoiceById(invoiceId, userId);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found or access denied.' });
  }
  return res.json({ invoice });
});

// ── PUT /api/invoices/:id — edit invoice information ─────────────────────────
invoices.put('/invoices/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const invoiceId = Number(req.params.id);
  if (Number.isNaN(invoiceId)) {
    return res.status(400).json({ error: 'Invalid invoice ID format.' });
  }

  const result = await updateInvoice(invoiceId, userId, req.body || {});
  return res.status(result.success ? 200 : 400).json(result);
});

// ── DELETE /api/invoices/:id — remove record + stored file ───────────────────
invoices.delete('/invoices/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const invoiceId = Number(req.params.id);
  if (Number.isNaN(invoiceId)) {
    return res.status(400).json({ error: 'Invalid invoice ID format.' });
  }

  const result = await deleteInvoice(invoiceId, userId);
  return res.status(result.success ? 200 : 404).json(result);
});
