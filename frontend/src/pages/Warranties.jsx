import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import './Warranties.css';

const today = () => new Date().toISOString().slice(0, 10);

function expiryFrom(startDate, months) {
  if (!startDate || !months) return '';
  const [year, month, day] = startDate.split('-').map(Number);
  const targetMonth = month - 1 + Number(months);
  const firstOfTarget = new Date(Date.UTC(year, targetMonth, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  return `${firstOfTarget.getUTCFullYear()}-${String(firstOfTarget.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function statusDisplay(status) {
  if (status === 'Expired') return 'warranty-status-expired';
  if (status === 'Expiring Soon') return 'warranty-status-soon';
  return 'warranty-status-active';
}

const blankForm = { product_id: '', start_date: today(), duration_months: '12' };

export default function Warranties() {
  const [products, setProducts] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const expiryDate = useMemo(() => expiryFrom(form.start_date, form.duration_months), [form.start_date, form.duration_months]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [productData, warrantyData] = await Promise.all([api.getProducts(), api.get('/api/warranties')]);
      setProducts(productData.products || []);
      setWarranties(warrantyData.warranties || []);
    } catch (err) {
      setError(err.message || 'Could not load warranty information.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  function resetForm() {
    setForm(blankForm);
    setEditingId(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const payload = { start_date: form.start_date, duration_months: Number(form.duration_months) };
      const result = editingId
        ? await api.put(`/api/warranties/${editingId}`, payload)
        : await api.post(`/api/products/${form.product_id}/warranties`, payload);
      setNotice(result.message || 'Warranty saved.');
      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Could not save warranty.');
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(warranty) {
    setSelected(warranty);
    setEditingId(warranty.warranty_id);
    setForm({ product_id: String(warranty.product_id), start_date: warranty.start_date, duration_months: String(warranty.duration_months) });
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(warranty) {
    if (!window.confirm(`Delete the warranty for ${warranty.product?.name || 'this product'}?`)) return;
    setError('');
    setNotice('');
    try {
      const result = await api.delete(`/api/warranties/${warranty.warranty_id}`);
      setNotice(result.message || 'Warranty deleted.');
      if (selected?.warranty_id === warranty.warranty_id) setSelected(null);
      if (editingId === warranty.warranty_id) resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Could not delete warranty.');
    }
  }

  const activeCount = warranties.filter((w) => w.status === 'Active').length;
  const soonCount = warranties.filter((w) => w.status === 'Expiring Soon').length;
  const expiredCount = warranties.filter((w) => w.status === 'Expired').length;

  return (
    <div className="warranty-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warranty Tracker</h1>
          <p className="page-subtitle">Keep warranty dates and coverage for your products in one place.</p>
        </div>
      </div>

      {error && <div className="warranty-alert warranty-alert-error" role="alert">{error}</div>}
      {notice && <div className="warranty-alert warranty-alert-success" role="status">{notice}</div>}

      <div className="warranty-summary">
        <div className="card warranty-summary-card"><span>Total warranties</span><strong>{warranties.length}</strong></div>
        <div className="card warranty-summary-card"><span>Active</span><strong>{activeCount}</strong></div>
        <div className="card warranty-summary-card"><span>Expiring in 30 days</span><strong>{soonCount}</strong></div>
        <div className="card warranty-summary-card"><span>Expired</span><strong>{expiredCount}</strong></div>
      </div>

      <section className="card warranty-form-card">
        <h2>{editingId ? 'Edit warranty' : 'Add a warranty'}</h2>
        <p className="warranty-form-help">Choose a product, enter its coverage start date and duration. Expiry is calculated for you.</p>
        <form onSubmit={handleSubmit}>
          {!editingId && <div className="form-group">
            <label htmlFor="warranty-product">Product</label>
            <select id="warranty-product" className="form-control" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} required>
              <option value="">Select a product</option>
              {products.map((product) => <option key={product.product_id} value={product.product_id}>{product.name}{product.brand ? ` · ${product.brand}` : ''}</option>)}
            </select>
            {products.length === 0 && <small>Add a product first, then you can attach its warranty here.</small>}
          </div>}
          {editingId && <div className="warranty-edit-product">Editing warranty for <strong>{selected?.product?.name || products.find((p) => String(p.product_id) === form.product_id)?.name || 'product'}</strong></div>}
          <div className="warranty-form-grid">
            <div className="form-group">
              <label htmlFor="warranty-start">Warranty start date</label>
              <input id="warranty-start" className="form-control" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="warranty-duration">Duration (months)</label>
              <input id="warranty-duration" className="form-control" type="number" min="1" max="1200" step="1" value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="warranty-expiry">Calculated expiry date</label>
              <input id="warranty-expiry" className="form-control" type="date" value={expiryDate} readOnly />
            </div>
          </div>
          <div className="warranty-form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving || (!editingId && products.length === 0)}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add warranty'}</button>
            {editingId && <button className="btn btn-secondary" type="button" onClick={resetForm}>Cancel</button>}
          </div>
        </form>
      </section>

      <section className="card warranty-list-card">
        <div className="warranty-list-heading"><div><h2>Your warranties</h2><p>Sorted by soonest expiry date.</p></div><button className="btn btn-secondary btn-sm" type="button" onClick={loadData}>Refresh</button></div>
        {loading ? <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto 1rem' }} /><p>Loading warranties…</p></div> : warranties.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🛡️</div><h3>No warranties yet</h3><p>Add a warranty above to start tracking its coverage period.</p></div>
        ) : <div className="warranty-list">
          {warranties.map((warranty) => {
            return <article className={`warranty-row ${selected?.warranty_id === warranty.warranty_id ? 'warranty-row-selected' : ''}`} key={warranty.warranty_id}>
              <button type="button" className="warranty-row-main" onClick={() => setSelected(selected?.warranty_id === warranty.warranty_id ? null : warranty)} aria-expanded={selected?.warranty_id === warranty.warranty_id}>
                <span className="warranty-shield" aria-hidden="true">🛡️</span>
                <span className="warranty-row-copy"><strong>{warranty.product?.name || `Product #${warranty.product_id}`}</strong><small>{warranty.product?.brand || 'Product warranty'} · {warranty.duration_months} months</small></span>
                <span className={`warranty-status ${statusDisplay(warranty.status)}`}>{warranty.status}</span>
                <span className="warranty-days">{warranty.remaining_days < 0 ? `${Math.abs(warranty.remaining_days)} days ago` : `${warranty.remaining_days} days left`}</span>
              </button>
              {selected?.warranty_id === warranty.warranty_id && <div className="warranty-details">
                <div><span>Start date</span><strong>{warranty.start_date}</strong></div>
                <div><span>Duration</span><strong>{warranty.duration_months} months</strong></div>
                <div><span>Expiry date</span><strong>{warranty.expiry_date}</strong></div>
                <div><span>Remaining time</span><strong>{warranty.remaining_days < 0 ? `Expired ${Math.abs(warranty.remaining_days)} days ago` : `${warranty.remaining_days} days`}</strong></div>
                <div className="warranty-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => beginEdit(warranty)}>Edit</button><button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(warranty)}>Delete</button></div>
              </div>}
            </article>;
          })}
        </div>}
      </section>
    </div>
  );
}
