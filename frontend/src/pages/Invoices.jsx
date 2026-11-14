/**
 * Invoices.jsx - Invoice & Receipt management page for Vaultly (Member 2).
 * Central dashboard: upload an invoice against any owned product, and browse,
 * preview, download or delete every invoice the user has ever saved.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import InvoiceUploader from '../components/InvoiceUploader';
import InvoiceList from '../components/InvoiceList';
import StatCard from '../components/StatCard';
import { formatFileSize } from '../services/invoiceService';

export default function Invoices() {
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadInvoices = useCallback(async () => {
    try {
      const data = await api.get('/api/invoices');
      setInvoices(data.invoices || []);
    } catch (err) {
      setLoadError(err.message || 'Could not load invoices.');
    }
  }, []);

  useEffect(() => {
    const loadEverything = async () => {
      setLoading(true);
      try {
        const productData = await api.get('/api/products');
        setProducts(productData.products || []);
        await loadInvoices();
      } catch (err) {
        setLoadError(err.message || 'Could not load your data.');
      } finally {
        setLoading(false);
      }
    };
    loadEverything();
  }, [loadInvoices]);

  const selectedProduct = products.find((p) => String(p.product_id) === selectedProductId);

  const totalStored = invoices.reduce((sum, invoice) => sum + (invoice.file_size || 0), 0);

  if (loading) {
    return (
      <div className="card empty-state">
        <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
        <p>Loading your invoices…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices & Receipts</h1>
          <p className="page-subtitle">Upload, preview, and download your purchase documents</p>
        </div>
      </div>

      {loadError && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p className="upload-message upload-message-error">⚠️ {loadError}</p>
          <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard icon="🧾" label="Saved Invoices" value={invoices.length} />
        <StatCard icon="💾" label="Storage Used" value={formatFileSize(totalStored)} />
        <StatCard icon="📦" label="Products Available" value={products.length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Upload panel */}
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
            ⬆️ Upload New Invoice
          </h3>

          {products.length === 0 ? (
            <p className="upload-note">
              You need at least one product first — add one from the Products page, then return
              here to attach its invoice.
            </p>
          ) : (
            <>
              <div className="form-group">
                <label>Attach to Product</label>
                <select
                  className="form-control"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  <option value="">— Select a product —</option>
                  {products.map((product) => (
                    <option key={product.product_id} value={product.product_id}>
                      {product.name} (#{product.product_id})
                    </option>
                  ))}
                </select>
              </div>

              {selectedProductId ? (
                <InvoiceUploader
                  key={selectedProductId}
                  productId={selectedProductId}
                  productLabel={selectedProduct?.name}
                  onUploaded={loadInvoices}
                />
              ) : (
                <p className="upload-note">Select a product above to enable the upload form.</p>
              )}
            </>
          )}
        </div>

        {/* Saved invoices panel */}
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
            🧾 Your Saved Invoices
          </h3>

          {invoices.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 0' }}>
              <div className="empty-icon">🧾</div>
              <h3>No invoices yet</h3>
              <p>Upload your first purchase receipt using the form on the left.</p>
            </div>
          ) : (
            <InvoiceList invoices={invoices} showProduct onDeleted={loadInvoices} />
          )}
        </div>
      </div>
    </div>
  );
}
