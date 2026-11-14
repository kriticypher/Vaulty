/**
 * invoiceService.js - Invoice API service for Vaultly (Member 2).
 * Handles the documented Base64 JSON upload transfer format, invoice listing,
 * secure authenticated downloads/previews, and deletion.
 *
 * All security rules below MIRROR the backend rules, so users get instant,
 * clear error messages without waiting for a server round-trip. The backend
 * still re-validates everything — the client checks are convenience only.
 */

import { api, API_BASE } from './api';

// Must match backend/invoices.py
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

const MIME_EXTENSIONS = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png']
};

/**
 * Client-side validation. Returns '' when valid, otherwise a friendly message.
 * Checks: extension whitelist + 5 MB size limit.
 */
export function validateInvoiceFile(file) {
  if (!file) {
    return 'Please choose a file to upload.';
  }
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return 'Unsupported file type. Only PDF, JPG, JPEG and PNG files are allowed.';
  }
  if (file.size === 0) {
    return 'The selected file is empty.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is too large (${formatFileSize(file.size)}). Maximum allowed size is 5 MB.`;
  }
  return '';
}

/** Converts a File into the Base64 string required by the transfer format. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL returns "data:application/pdf;base64,AAAA..." —
      // the backend expects only the Base64 payload after the comma.
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      if (!base64) {
        reject(new Error('Could not read the selected file. Please try again.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

/** Formats byte counts for the UI (e.g. "1.4 MB", "820 KB"). */
export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Uploads one invoice using the documented Base64 JSON transfer format:
 * POST /api/products/{productId}/invoices
 * `force: true` is the explicit "save anyway" confirmation for duplicates.
 */
export async function uploadInvoice(productId, metadata, file, force = false) {
  const fileData = await fileToBase64(file);
  return api.post(`/api/products/${productId}/invoices`, {
    file_name: file.name,
    file_data: fileData,
    invoice_number: metadata.invoice_number || '',
    seller: metadata.seller || '',
    invoice_date: metadata.invoice_date || '',
    force
  });
}

/** Lists invoices — optional Part E search & sort params. */
export function getAllInvoices(params = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) {
      searchParams.append(key, value);
    }
  }
  const queryString = searchParams.toString();
  return api.get(`/api/invoices${queryString ? '?' + queryString : ''}`);
}

/** Lists invoices attached to one product. */
export function getProductInvoices(productId) {
  return api.get(`/api/products/${productId}/invoices`);
}

/** Opens one invoice's full details. */
export function getInvoiceDetails(invoiceId) {
  return api.get(`/api/invoices/${invoiceId}`);
}

/**
 * Edits invoice information (invoice_number, seller, invoice_date and the
 * linked product). The stored file itself never changes through this call.
 */
export function updateInvoice(invoiceId, changes) {
  return api.put(`/api/invoices/${invoiceId}`, changes);
}

/** Deletes an invoice record and its stored file. */
export function deleteInvoice(invoiceId) {
  return api.delete(`/api/invoices/${invoiceId}`);
}

/**
 * OCR preview (Part: OCR): sends the selected file to the backend BEFORE
 * uploading; the server extracts text (PDF via zlib, images via tesseract.js)
 * and returns detected fields so the form can be auto-filled. Nothing is stored.
 */
export async function ocrExtract(file) {
  const fileData = await fileToBase64(file);
  const result = await api.post('/api/invoices/ocr-preview', {
    file_name: file.name,
    file_data: fileData
  });
  return result.ocr || {};
}

/**
 * Fetches the actual invoice file as a Blob using the Authorization header
 * (never a plain <img src> URL, so the session token is always attached and
 * other users' files stay unreachable).
 */
export async function fetchInvoiceBlob(invoiceId) {
  const token = localStorage.getItem('vaultly_token') || '';
  const response = await fetch(`${API_BASE}/api/invoices/${invoiceId}/download`, {
    headers: { 'Authorization': `Bearer ${token}` },
    credentials: 'include' // cookie session also authenticates this call
  });
  if (!response.ok) {
    let message = 'Could not load the invoice file.';
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {
      // Non-JSON error response — keep the generic message
    }
    throw new Error(message);
  }
  return response.blob();
}

/** Downloads the invoice with its original file name. */
export async function downloadInvoice(invoice) {
  const blob = await fetchInvoiceBlob(invoice.invoice_id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = invoice.original_filename || 'invoice';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Opens the invoice (image or PDF) in a new tab for preview. */
export async function previewInvoice(invoice) {
  const blob = await fetchInvoiceBlob(invoice.invoice_id);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Revoke later so the new tab has time to load the blob
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Small badge label for a file type, e.g. "PDF", "JPG". */
export function fileTypeBadge(mimeType) {
  const extensions = MIME_EXTENSIONS[mimeType];
  if (!extensions) return 'FILE';
  return extensions[0].toUpperCase();
}
