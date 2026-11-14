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
import { formatFileSize, getAllInvoices, downloadInvoicesCsv } from '../services/invoiceService';

export default function Invoices() {
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Part E: search & sort controls
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [sortOrder, setSortOrder] = useState('');

  // Part F: CSV export
  const handleExportCsv = async () => {
    setExporting(true);
    setExportError('');
    try {
      await downloadInvoicesCsv();
    } catch (err) {
      setExportError(err.message || 'Could not export the CSV.');
    } finally {
      setExporting(false);
    }
  };

  const loadInvoices = useCallback(async (search = '', field = 'all', sort = '') => {
    try {
      const data = await getAllInvoices({ search, field, sort });
      setInvoices(data.invoices || []);
    } catch (err) {
      setLoadError(err.message || 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-run the search whenever a control changes (300 ms debounce while typing)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadInvoices(searchText, searchField, sortOrder);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, searchField, sortOrder, loadInvoices]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const productData = await api.get('/api/products');
        setProducts(productData.products || []);
      } catch (err) {
        setLoadError(err.message || 'Could not load your products.');
      }
    };
    loadProducts();
  }, []);

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

      {/* Part E: Search & Sort controls */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search Invoices</label>
            <input
              className="form-control"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Type to search…"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search In</label>
            <select
              className="form-control"
              value={searchField}
              onChange={(e) => setSearchField(e.target.value)}
            >
              <option value="all">Everything</option>
              <option value="invoice_number">Invoice Number</option>
              <option value="seller">Seller</option>
              <option value="product">Product Name</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Sort by Invoice Date</label>
            <select
              className="form-control"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="">Newest Uploads First</option>
              <option value="date_desc">Date: Newest First</option>
              <option value="date_asc">Date: Oldest First</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>&nbsp;</label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCsv}
              disabled={exporting}
              title="Download all your invoices as a CSV file"
            >
              {exporting ? '⏳ Exporting…' : '⬇️ Export CSV'}
            </button>
          </div>
        </div>
        {exportError && (
          <p className="upload-message upload-message-error" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            ⚠️ {exportError}
          </p>
        )}
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard icon="🧾" label={searchText ? 'Matching Invoices' : 'Saved Invoices'} value={invoices.length} />
        <StatCard icon="💾" label="Storage Used" value={formatFileSize(totalStored)} />
        <StatCard icon="📦" label="Products Available" value={products.length} />
      </div>

      <div className="invoices-layout">
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
                  onUploaded={() => loadInvoices(searchText, searchField, sortOrder)}
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
              <div className="empty-icon">{searchText ? '🔍' : '🧾'}</div>
              <h3>{searchText ? 'No matching invoices' : 'No invoices yet'}</h3>
              <p>
                {searchText
                  ? `Nothing matches "${searchText}". Try a different term or switch the "Search In" field.`
                  : 'Upload your first purchase receipt using the form on the left.'}
              </p>
            </div>
          ) : (
            <InvoiceList
              invoices={invoices}
              showProduct
              onDeleted={() => loadInvoices(searchText, searchField, sortOrder)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
