import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import './Warranties.css';
import './Member3.css';

const emptyForm = { service_date: new Date().toISOString().slice(0, 10), service_center: '', cost: '', description: '' };
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);

export default function ServiceHistory() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.getProducts().then((data) => { const list = data.products || []; setProducts(list); if (list.length) setProductId(String(list[0].product_id)); })
      .catch((err) => setError(err.message || 'Could not load products.')).finally(() => setLoadingProducts(false));
  }, []);

  async function loadHistory(id = productId) {
    if (!id) { setRecords([]); setTotal(0); return; }
    setLoading(true); setError('');
    try { const data = await api.get(`/api/products/${id}/services`); setRecords(data.services || []); setTotal(data.total_expenditure || 0); }
    catch (err) { setError(err.message || 'Could not load service history.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (productId) loadHistory(productId); }, [productId]);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const payload = { ...form, cost: form.cost === '' ? null : Number(form.cost) };
      const result = editingId ? await api.put(`/api/services/${editingId}`, payload) : await api.post(`/api/products/${productId}/services`, payload);
      setNotice(result.message || 'Service record saved.'); setEditingId(null); setForm(emptyForm); await loadHistory();
    } catch (err) { setError(err.message || 'Could not save service record.'); }
    finally { setSaving(false); }
  }

  function edit(record) {
    setEditingId(record.service_id);
    setForm({ service_date: record.service_date, service_center: record.service_center || '', cost: record.cost ?? '', description: record.description || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(record) {
    if (!window.confirm('Delete this service record?')) return;
    setError(''); setNotice('');
    try { const result = await api.delete(`/api/services/${record.service_id}`); setNotice(result.message); if (editingId === record.service_id) { setEditingId(null); setForm(emptyForm); } await loadHistory(); }
    catch (err) { setError(err.message || 'Could not delete service record.'); }
  }

  const product = products.find((p) => String(p.product_id) === String(productId));
  return <div className="warranty-page member3-page">
    <div className="page-header"><div><h1 className="page-title">Service &amp; Repair History</h1><p className="page-subtitle">Keep maintenance records and repair costs for each product.</p></div></div>
    {error && <div className="warranty-alert warranty-alert-error" role="alert">{error}</div>}{notice && <div className="warranty-alert warranty-alert-success" role="status">{notice}</div>}
    <section className="card warranty-form-card"><div className="service-product-picker"><div className="form-group"><label htmlFor="service-product">Product</label><select id="service-product" className="form-control" value={productId} onChange={(e) => { setProductId(e.target.value); setEditingId(null); setForm(emptyForm); }} disabled={loadingProducts || products.length === 0}><option value="">Select a product</option>{products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</option>)}</select></div><div className="service-total"><span>Total repair expenditure</span><strong>{money(total)}</strong></div></div>
      <h2>{editingId ? 'Edit service record' : 'Add a service record'}</h2><p className="warranty-form-help">Record the service date, center, cost and any useful notes.</p>
      <form onSubmit={submit}><div className="member3-form-grid"><div className="form-group"><label htmlFor="service-date">Service date</label><input id="service-date" className="form-control" type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} required /></div><div className="form-group"><label htmlFor="service-center">Service center</label><input id="service-center" className="form-control" value={form.service_center} onChange={(e) => setForm({ ...form, service_center: e.target.value })} maxLength="200" placeholder="e.g. Authorized service center" /></div><div className="form-group"><label htmlFor="service-cost">Cost (₹)</label><input id="service-cost" className="form-control" type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Optional" /></div></div><div className="form-group"><label htmlFor="service-description">Description</label><textarea id="service-description" className="form-control" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength="2000" placeholder="What was inspected, repaired or replaced?" /></div><div className="warranty-form-actions"><button className="btn btn-primary" type="submit" disabled={saving || !productId}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add service record'}</button>{editingId && <button type="button" className="btn btn-secondary" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</button>}</div></form>
    </section>
    <section className="card warranty-list-card"><div className="warranty-list-heading"><div><h2>Service history{product ? ` · ${product.name}` : ''}</h2><p>Sorted by service date, newest first.</p></div><button className="btn btn-secondary btn-sm" type="button" onClick={() => loadHistory()}>Refresh</button></div>
      {loading || loadingProducts ? <div className="empty-state"><p>Loading service history…</p></div> : !productId ? <div className="empty-state"><div className="empty-icon">🔧</div><h3>No products yet</h3><p>Add a product before recording service history.</p></div> : records.length === 0 ? <div className="empty-state"><div className="empty-icon">🔧</div><h3>No service records</h3><p>Add a repair or maintenance visit using the form above.</p></div> : <div className="member3-records">{records.map((record) => <article className="member3-record" key={record.service_id}><div className="member3-service-top"><div><strong>{record.service_center || 'Service visit'}</strong><small>{record.service_date}</small></div><strong className="service-cost">{record.cost === null ? 'Cost not recorded' : money(record.cost)}</strong></div>{record.description && <p className="service-description">{record.description}</p>}<div className="member3-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => edit(record)}>Edit</button><button type="button" className="btn btn-danger btn-sm" onClick={() => remove(record)}>Delete</button></div></article>)}</div>}
    </section>
  </div>;
}
