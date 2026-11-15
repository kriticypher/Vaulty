import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import StatCard from '../components/StatCard';
import ProductTable from '../components/ProductTable';
import './Dashboard.css';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/api/dashboard');
      setStats(data);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="card empty-state">
        <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
        <p>Loading your dashboard analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        {error}
      </div>
    );
  }

  const formattedSpending = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(stats?.total_spending || 0);

  const formattedAvg = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(stats?.avg_price || 0);

  const formattedMax = stats?.most_expensive
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
      }).format(stats.most_expensive.price)
    : 'None';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">Real-time inventory metrics and purchase summaries</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/products/add')}
          type="button"
        >
          + Add Product
        </button>
      </div>

      {/* Top 4 Metrics StatCards */}
      <div className="stats-grid">
        <StatCard
          icon="📦"
          label="Total Products"
          value={stats?.total_products || 0}
          subtitle="Registered in vault"
        />
        <StatCard
          icon="💰"
          label="Total Expenditure"
          value={formattedSpending}
          subtitle="Lifetime purchases"
        />
        <StatCard
          icon="🏷️"
          label="Active Categories"
          value={stats?.total_categories || 0}
          subtitle="Distinct item groups"
        />
        <StatCard
          icon="📊"
          label="Average Item Value"
          value={formattedAvg}
          subtitle="Mean unit price"
        />
      </div>

      {/* Server-calculated reminders load with this dashboard request. They
          are in-app only and do not run while the browser is closed. */}
      {stats?.reminders?.length > 0 && (
        <section className="card dashboard-reminders" aria-labelledby="dashboard-reminders-title">
          <div className="dashboard-reminders-heading">
            <div>
              <h2 id="dashboard-reminders-title">Reminders</h2>
              <p>Warranty and return dates that need attention</p>
            </div>
            <span className="dashboard-reminders-count">{stats.reminders.length}</span>
          </div>
          <ul className="dashboard-reminder-list">
            {stats.reminders.map((reminder) => {
              const expired = ['warranty_expired', 'return_expired', 'return_closed'].includes(reminder.kind);
              const statusClass = expired ? 'dashboard-reminder-expired'
                : reminder.days_remaining <= 7 ? 'dashboard-reminder-urgent'
                  : 'dashboard-reminder-soon';
              const remainingLabel = reminder.days_remaining < 0
                ? `${Math.abs(reminder.days_remaining)} days past date`
                : `${reminder.days_remaining} ${reminder.days_remaining === 1 ? 'day' : 'days'} remaining`;
              return (
                <li className={`dashboard-reminder ${statusClass}`} key={reminder.reminder_id}>
                  <div className="dashboard-reminder-icon" aria-hidden="true">{reminder.type === 'warranty' ? '🛡️' : '↩️'}</div>
                  <div className="dashboard-reminder-copy">
                    <strong>{reminder.product_name}</strong>
                    <span>{reminder.message}</span>
                    <small>{reminder.type === 'warranty' ? 'Expiry' : 'Deadline'}: {reminder.date} · {remainingLabel}</small>
                  </div>
                  <div className="dashboard-reminder-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(reminder.module_path)}>
                      View {reminder.type === 'warranty' ? 'warranty' : 'return'}
                    </button>
                    <button type="button" className="dashboard-product-link" onClick={() => navigate(reminder.product_path)}>
                      Product details
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Middle Section: Recently Added Products & Category Breakdown */}
      <div className="grid-sidebar" style={{ marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Recently Added Products</h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/products')}
            >
              View All ({stats?.total_products || 0}) →
            </button>
          </div>

          <ProductTable products={stats?.recent_products || []} />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Spending by Category</h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/analytics')}
            >
              Details
            </button>
          </div>

          <div className="card">
            {stats?.category_spending && stats.category_spending.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {stats.category_spending.slice(0, 5).map((cat) => {
                  const percent = stats.total_spending > 0
                    ? Math.round((cat.total_spent / stats.total_spending) * 100)
                    : 0;

                  return (
                    <div key={cat.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600 }}>{cat.category}</span>
                        <span style={{ color: '#64748b' }}>
                          ₹{cat.total_spent.toLocaleString('en-IN')} ({percent}%)
                        </span>
                      </div>
                      <div style={{ height: '7px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: '#2563eb',
                            borderRadius: '4px'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <p>No category data available yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
