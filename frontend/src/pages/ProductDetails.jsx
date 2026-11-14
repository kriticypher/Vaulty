import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import InvoiceUploader from '../components/InvoiceUploader';
import InvoiceList from '../components/InvoiceList';

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    brand: '',
    category: '',
    price: '',
    purchase_date: '',
    description: ''
  });
  const [saveLoading, setSaveLoading] = useState(false);

  const loadDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/api/products/${id}`);
      setDetails(data);
      const p = data.product;
      setEditForm({
        name: p.name || '',
        brand: p.brand || '',
        category: p.category || '',
        price: p.price || '',
        purchase_date: p.purchase_date || '',
        description: p.description || ''
      });
    } catch (err) {
      setError(err.message || 'Could not load product details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [id]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      await api.put(`/api/products/${id}`, {
        ...editForm,
        price: parseFloat(editForm.price)
      });
      setIsEditing(false);
      await loadDetails();
    } catch (err) {
      alert(err.message || 'Failed to update product.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this product? All linked tracking items will be removed.')) {
      return;
    }
    try {
      await api.delete(`/api/products/${id}`);
      navigate('/products');
    } catch (err) {
      alert(err.message || 'Failed to delete product.');
    }
  };

  if (loading) {
    return (
      <div className="card empty-state">
        <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
        <p>Loading item details...</p>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="card empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>Product Not Found</h3>
        <p>{error || 'This product does not exist or access was denied.'}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/products')} style={{ marginTop: '1rem' }}>
          Back to Products
        </button>
      </div>
    );
  }

  const p = details.product;
  const formattedPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(p.price);

  return (
    <div>
      <div className="page-header">
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/products')}
            style={{ marginBottom: '0.75rem' }}
          >
            ← Back to Products
          </button>
          <h1 className="page-title">{p.name}</h1>
          <p className="page-subtitle">Product ID #{p.product_id} • Registered on {p.created_at}</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? 'Cancel Editing' : '✏️ Edit Product'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
          >
            🗑️ Delete
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="card" style={{ maxWidth: '640px', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 600 }}>Update Product Information</h3>
          <form onSubmit={handleUpdate}>
            <div className="form-group">
              <label>Product Name</label>
              <input
                className="form-control"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>Brand</label>
                <input
                  className="form-control"
                  value={editForm.brand}
                  onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input
                  className="form-control"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>Price (₹)</label>
                <input
                  className="form-control"
                  type="number"
                  step="0.01"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Purchase Date</label>
                <input
                  className="form-control"
                  type="date"
                  value={editForm.purchase_date}
                  onChange={(e) => setEditForm({ ...editForm, purchase_date: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>Notes / Description</label>
              <textarea
                className="form-control"
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saveLoading}>
              {saveLoading ? 'Updating...' : 'Save Changes'}
            </button>
          </form>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
              Purchase Overview
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Purchase Price:</span>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>{formattedPrice}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Brand:</span>
                <p style={{ fontWeight: 600 }}>{p.brand || 'Unspecified'}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Category:</span>
                <p>{p.category ? <span className="badge badge-primary">{p.category}</span> : 'Uncategorized'}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Purchase Date:</span>
                <p style={{ fontWeight: 600 }}>📅 {p.purchase_date}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
              Description & Notes
            </h3>
            <p style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6 }}>
              {p.description || 'No additional purchase notes recorded.'}
            </p>
          </div>
        </div>
      )}

      {/* Invoices (Member 2) */}
      <div className="card" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
          🧾 Invoices & Receipts
        </h3>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}>
          Attach purchase receipts (PDF, JPG, JPEG, PNG — max 5 MB) to this product. Saved
          documents can be previewed or downloaded any time.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
          <InvoiceUploader
            productId={p.product_id}
            productLabel={p.name}
            onUploaded={loadDetails}
          />

          <div>
            {details.invoices && details.invoices.length > 0 ? (
              <InvoiceList
                invoices={details.invoices}
                onDeleted={loadDetails}
              />
            ) : (
              <p className="upload-note">No receipts uploaded yet for this product.</p>
            )}
          </div>
        </div>
      </div>

      {/* Linked Records (Member 3) */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
        Linked Records (Team Integration Placeholders)
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
        {/* Warranties (Member 3) */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>🛡️ Warranty Status</h4>
            <span className="badge badge-warning">Member 3</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {details.warranties && details.warranties.length > 0
              ? `${details.warranties.length} warranty record registered`
              : 'No warranty record attached yet.'}
          </p>
        </div>

        {/* Returns (Member 3) */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>↩️ Return Window</h4>
            <span className="badge badge-warning">Member 3</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {details.returns && details.returns.length > 0
              ? `${details.returns.length} return deadline recorded`
              : 'No return tracking configured.'}
          </p>
        </div>

        {/* Service History (Member 3) */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>🔧 Service Records</h4>
            <span className="badge badge-warning">Member 3</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {details.services && details.services.length > 0
              ? `${details.services.length} maintenance record(s)`
              : 'No service history logged.'}
          </p>
        </div>
      </div>
    </div>
  );
}
