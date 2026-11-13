/**
 * InvoiceDetails.jsx - "Open invoice details" page for Vaultly (Member 2).
 * Shows every stored field of one invoice (invoice_id, product, invoice_number,
 * seller, invoice_date, plus file bookkeeping), lets the user edit the
 * information, re-link it to another product, preview/download the original
 * file, or delete the invoice entirely.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import {
  getInvoiceDetails,
  updateInvoice,
  deleteInvoice,
  downloadInvoice,
  previewInvoice,
  formatFileSize,
  fileTypeBadge
} from '../services/invoiceService';

export default function InvoiceDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    invoice_number: '',
    seller: '',
    invoice_date: '',
    product_id: ''
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getInvoiceDetails(id);
      setInvoice(data.invoice);
      const inv = data.invoice;
      setEditForm({
        invoice_number: inv.invoice_number || '',
        seller: inv.seller || '',
        invoice_date: inv.invoice_date || '',
        product_id: String(inv.product_id)
      });
    } catch (err) {
      setLoadError(err.message || 'Could not load invoice details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInvoice();
    // Products list is only needed for the "re-link product" dropdown
    api.get('/api/products')
      .then((data) => setProducts(data.products || []))
      .catch(() => setProducts([]));
  }, [loadInvoice]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaveLoading(true);
    setActionError('');
    try {
      const result = await updateInvoice(id, {
        ...editForm,
        product_id: parseInt(editForm.product_id, 10)
      });
      setIsEditing(false);
      if (result.invoice) {
        setInvoice(result.invoice);
      } else {
        await loadInvoice();
      }
    } catch (err) {
      setActionError(err.message || 'Failed to update invoice.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this invoice? The stored file will also be removed permanently.')) {
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      await deleteInvoice(id);
      navigate('/invoices');
    } catch (err) {
      setActionError(err.message || 'Failed to delete invoice.');
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    setBusy(true);
    setActionError('');
    try {
      await previewInvoice(invoice);
    } catch (err) {
      setActionError(err.message || 'Preview failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    setActionError('');
    try {
      await downloadInvoice(invoice);
    } catch (err) {
      setActionError(err.message || 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="card empty-state">
        <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
        <p>Loading invoice details…</p>
      </div>
    );
  }

  if (loadError || !invoice) {
    return (
      <div className="card empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>Invoice Not Found</h3>
        <p>{loadError || 'This invoice does not exist or access was denied.'}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/invoices')} style={{ marginTop: '1rem' }}>
          Back to Invoices
        </button>
      </div>
    );
  }

  const linkedProduct = products.find((p) => p.product_id === invoice.product_id);

  return (
    <div>
      <div className="page-header">
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/invoices')}
            style={{ marginBottom: '0.75rem' }}
          >
            ← Back to Invoices
          </button>
          <h1 className="page-title">
            {fileTypeBadge(invoice.mime_type) === 'PDF' ? '📕' : '🖼️'}{' '}
            {invoice.original_filename || `Invoice #${invoice.invoice_id}`}
          </h1>
          <p className="page-subtitle">Invoice ID #{invoice.invoice_id} • Uploaded {invoice.uploaded_at || 'unknown'}</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={busy}>
            👁️ Preview
          </button>
          <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={busy}>
            ⬇️ Download
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
            🗑️ Delete
          </button>
        </div>
      </div>

      {actionError && (
        <p className="upload-message upload-message-error" style={{ marginBottom: '1rem' }}>⚠️ {actionError}</p>
      )}

      {isEditing ? (
        <div className="card" style={{ maxWidth: '640px', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 600 }}>Edit Invoice Information</h3>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label>Invoice Number</label>
              <input
                className="form-control"
                value={editForm.invoice_number}
                onChange={(e) => setEditForm({ ...editForm, invoice_number: e.target.value })}
                placeholder="e.g. INV-2026-001"
              />
            </div>
            <div className="form-group">
              <label>Seller / Store</label>
              <input
                className="form-control"
                value={editForm.seller}
                onChange={(e) => setEditForm({ ...editForm, seller: e.target.value })}
                placeholder="e.g. Amazon"
              />
            </div>
            <div className="form-group">
              <label>Invoice Date</label>
              <input
                className="form-control"
                type="date"
                value={editForm.invoice_date}
                onChange={(e) => setEditForm({ ...editForm, invoice_date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Linked Product</label>
              <select
                className="form-control"
                value={editForm.product_id}
                onChange={(e) => setEditForm({ ...editForm, product_id: e.target.value })}
              >
                {products.map((product) => (
                  <option key={product.product_id} value={product.product_id}>
                    {product.name} (#{product.product_id})
                  </option>
                ))}
              </select>
              <p className="upload-note">
                The stored file (file_path) is managed by the system and cannot be edited —
                delete and re-upload to replace it.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saveLoading}>
                {saveLoading ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: '640px', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Invoice Information</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)}>
              ✏️ Edit
            </button>
          </div>
          <div className="invoice-detail-rows">
            <div className="invoice-detail-row">
              <span className="invoice-detail-label">Invoice ID</span>
              <span className="invoice-detail-value">#{invoice.invoice_id}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="invoice-detail-label">Product</span>
              <span className="invoice-detail-value">
                {linkedProduct ? linkedProduct.name : `Product #${invoice.product_name || invoice.product_id}`}
                {linkedProduct && (
                  <Link to={`/products/${invoice.product_id}`} className="invoice-detail-link">
                    open product →
                  </Link>
                )}
              </span>
            </div>
            <div className="invoice-detail-row">
              <span className="invoice-detail-label">Invoice Number</span>
              <span className="invoice-detail-value">{invoice.invoice_number || '—'}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="invoice-detail-label">Seller</span>
              <span className="invoice-detail-value">{invoice.seller || '—'}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="invoice-detail-label">Invoice Date</span>
              <span className="invoice-detail-value">{invoice.invoice_date || '—'}</span>
            </div>
            <div className="invoice-detail-row">
              <span className="invoice-detail-label">File</span>
              <span className="invoice-detail-value">
                {invoice.original_filename || '—'} • {fileTypeBadge(invoice.mime_type)} • {formatFileSize(invoice.file_size)}
              </span>
            </div>
            <div className="invoice-detail-row">
              <span className="invoice-detail-label">Storage Path</span>
              <span className="invoice-detail-value invoice-detail-path">{invoice.file_path}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
