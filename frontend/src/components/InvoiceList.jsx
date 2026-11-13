/**
 * InvoiceList.jsx - Reusable invoice listing for Vaultly (Member 2).
 * Shows each saved invoice with its product, type, size, date and actions:
 * Preview (opens in a new tab), Download (saves with the original file name),
 * and Delete (removes both the record and the stored file).
 */

import React, { useState } from 'react';
import {
  downloadInvoice,
  previewInvoice,
  deleteInvoice,
  formatFileSize,
  fileTypeBadge
} from '../services/invoiceService';

export default function InvoiceList({ invoices, showProduct = false, onDeleted }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const handleDownload = async (invoice) => {
    setBusyId(invoice.invoice_id);
    setError('');
    try {
      await downloadInvoice(invoice);
    } catch (err) {
      setError(err.message || 'Download failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePreview = async (invoice) => {
    setBusyId(invoice.invoice_id);
    setError('');
    try {
      await previewInvoice(invoice);
    } catch (err) {
      setError(err.message || 'Preview failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (invoice) => {
    if (!window.confirm(`Delete invoice "${invoice.original_filename || invoice.invoice_id}"? This also removes the stored file.`)) {
      return;
    }
    setBusyId(invoice.invoice_id);
    setError('');
    try {
      await deleteInvoice(invoice.invoice_id);
      if (onDeleted) {
        onDeleted(invoice);
      }
    } catch (err) {
      setError(err.message || 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return (
      <div>
        <p className="upload-message upload-message-error">⚠️ {error}</p>
        <button className="btn btn-secondary btn-sm" onClick={() => setError('')}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="invoice-list">
      {invoices.map((invoice) => (
        <div className="invoice-item" key={invoice.invoice_id}>
          <div className="invoice-item-icon">
            {fileTypeBadge(invoice.mime_type) === 'PDF' ? '📕' : '🖼️'}
          </div>

          <div className="invoice-item-info">
            <span className="invoice-item-name">
              {invoice.original_filename || `Invoice #${invoice.invoice_id}`}
            </span>
            <span className="invoice-item-sub">
              {showProduct && invoice.product_name ? `${invoice.product_name} • ` : ''}
              {fileTypeBadge(invoice.mime_type)} • {formatFileSize(invoice.file_size)}
              {invoice.invoice_number ? ` • ${invoice.invoice_number}` : ''}
              {invoice.uploaded_at ? ` • uploaded ${invoice.uploaded_at}` : ''}
            </span>
          </div>

          <div className="invoice-item-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handlePreview(invoice)}
              disabled={busyId === invoice.invoice_id}
            >
              👁️ Preview
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleDownload(invoice)}
              disabled={busyId === invoice.invoice_id}
            >
              ⬇️ Download
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => handleDelete(invoice)}
              disabled={busyId === invoice.invoice_id}
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
