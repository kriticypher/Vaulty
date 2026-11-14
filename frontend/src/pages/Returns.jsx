import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import './Warranties.css';
import './Member3.css';

const STATUSES = ['Pending', 'Returned', 'Non-returnable', 'Closed'];
const emptyForm = { product_id: '', return_deadline: '', return_status: 'Pending' };

export default function Returns() {
  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true); setError('');
    try {
      const [p, r] = await Promise.all([api.getProducts(), api.get('/api/returns')]);
      setProducts(p.products || []); setRecords(r.returns || []);
    } catch (err) { setError(err.message || 'Could not load return windows.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadData(); }, []);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const payload = { return_deadline: form.return_deadline, return_status: form.return_status };
      const result = editingId ? await api.put(`/api/returns/${editingId}`, payload) : await api.post(`/api/products/${form.product_id}/returns`, payload);
      setNotice(result.message || 'Return window saved.'); setEditingId(null); setForm(emptyForm); await loadData();
    } catch (err) { setError(err.message || 'Could not save return window.'); }
    finally { setSaving(false); }
  }

  function edit(record) {
    setEditingId(record.return_id);
    setForm({ product_id: String(record.product_id), return_deadline: record.return_deadline, return_status: record.return_status });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function setStatus(record, status) {
    setError(''); setNotice('');
    try { const result = await api.put(`/api/returns/${record.return_id}`, { return_status: status }); setNotice(result.message); await loadData(); }
    catch (err) { setError(err.message || 'Could not update return status.'); }
  }

  async function remove(record) {
    if (!window.confirm(`Delete the return window for ${record.product?.name || 'this product'}?`)) return;
    setError(''); setNotice('');
    try { const result = await api.delete(`/api/returns/${record.return_id}`); setNotice(result.message); if (editingId === record.return_id) { setEditingId(null); setForm(emptyForm); } await loadData(); }
    catch (err) { setError(err.message || 'Could not delete return window.'); }
  }

  const approaching = records.filter((r) => r.return_status === 'Pending' && r.remaining_days >= 0 && r.remaining_days <= 7).length;
  const pending = records.filter((r) => r.return_status === 'Pending').length;
  return <div className="warranty-page member3-page">
    <div className="page-header"><div><h1 className="page-title">Return Windows</h1><p className="page-subtitle">Track the actual return deadline for each purchase.</p></div></div>
    {error && <div className="warranty-alert warranty-alert-error" role="alert">{error}</div>}{notice && <div className="warranty-alert warranty-alert-success" role="status">{notice}</div>}
    <div className="warranty-summary">
      <div className="card warranty-summary-card"><span>Total return windows</span><strong>{records.length}</strong></div>
      <div className="card warranty-summary-card"><span>Pending</span><strong>{pending}</strong></div>
      <div className="card warranty-summary-card"><span>Approaching (7 days)</span><strong>{approaching}</strong></div>
      <div className="card warranty-summary-card"><span>Completed / closed</span><strong>{records.length - pending}</strong></div>
    </div>
    <section className="card warranty-form-card"><h2>{editingId ? 'Edit return window' : 'Add a return window'}</h2><p className="warranty-form-help">Enter the deadline shown by the seller. Return periods vary, so Vaultly does not guess this date.</p>
      <form onSubmit={submit}>
        {!editingId && <div className="form-group"><label htmlFor="return-product">Product</label><select id="return-product" className="form-control" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} required><option value="">Select a product</option>{products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</option>)}</select>{products.length === 0 && <small>Add a product first.</small>}</div>}
        <div className="member3-form-grid"><div className="form-group"><label htmlFor="return-deadline">Actual return deadline</label><input id="return-deadline" className="form-control" type="date" value={form.return_deadline} onChange={(e) => setForm({ ...form, return_deadline: e.target.value })} required /></div>
          {editingId && <div className="form-group"><label htmlFor="return-status">Status</label><select id="return-status" className="form-control" value={form.return_status} onChange={(e) => setForm({ ...form, return_status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>}
        </div>
        <div className="warranty-form-actions"><button className="btn btn-primary" type="submit" disabled={saving || (!editingId && !products.length)}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add return window'}</button>{editingId && <button type="button" className="btn btn-secondary" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</button>}</div>
      </form>
    </section>
    <section className="card warranty-list-card"><div className="warranty-list-heading"><div><h2>Return deadlines</h2><p>Pending deadlines within seven days are highlighted.</p></div><button className="btn btn-secondary btn-sm" onClick={loadData} type="button">Refresh</button></div>
      {loading ? <div className="empty-state"><p>Loading return windows…</p></div> : records.length === 0 ? <div className="empty-state"><div className="empty-icon">↩️</div><h3>No return windows yet</h3><p>Add the deadline supplied by the seller.</p></div> : <div className="member3-records">{records.map((record) => {
        const soon = record.return_status === 'Pending' && record.remaining_days >= 0 && record.remaining_days <= 7;
        const daysText = record.remaining_days < 0 ? `${Math.abs(record.remaining_days)} days past deadline` : `${record.remaining_days} days remaining`;
        return <article className="member3-record" key={record.return_id}>
          <div className="member3-record-main"><div><strong>{record.product?.name || `Product #${record.product_id}`}</strong><small>Deadline: {record.return_deadline} · {daysText}</small></div><span className={`warranty-status ${record.return_status === 'Pending' ? (soon ? 'warranty-status-soon' : 'warranty-status-active') : 'warranty-status-expired'}`}>{record.return_status}</span></div>
          {soon && <div className="member3-deadline-note">Approaching deadline · {record.remaining_days === 0 ? 'due today' : `${record.remaining_days} day(s) left`}</div>}
          <div className="member3-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => edit(record)}>Edit</button>{record.return_status !== 'Returned' && <button className="btn btn-secondary btn-sm" type="button" onClick={() => setStatus(record, 'Returned')}>Mark returned</button>}{record.return_status !== 'Non-returnable' && <button className="btn btn-secondary btn-sm" type="button" onClick={() => setStatus(record, 'Non-returnable')}>Non-returnable</button>}{record.return_status !== 'Closed' && <button className="btn btn-secondary btn-sm" type="button" onClick={() => setStatus(record, 'Closed')}>Close period</button>}<button className="btn btn-danger btn-sm" type="button" onClick={() => remove(record)}>Delete</button></div>
        </article>;
      })}</div>}
    </section>
  </div>;
}
