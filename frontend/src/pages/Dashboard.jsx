import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import StatCard from '../components/StatCard';
import ProductTable from '../components/ProductTable';

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

      {/* Upcoming Reminders Section (Member 3 Integration Hook) */}
      {((stats?.upcoming_warranties && stats.upcoming_warranties.length > 0) ||
        (stats?.upcoming_returns && stats.upcoming_returns.length > 0)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {stats.upcoming_warranties.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#b45309', marginBottom: '0.5rem' }}>
                🛡️ Warranties Expiring Soon (≤30 Days)
              </h3>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem' }}>
                {stats.upcoming_warranties.map((w) => (
                  <li key={w.warranty_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{w.product_name}</span>
                    <span className="badge badge-warning">{w.days_remaining} days remaining</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stats.upcoming_returns.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#b91c1c', marginBottom: '0.5rem' }}>
                ↩️ Approaching Return Deadlines (≤7 Days)
              </h3>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem' }}>
                {stats.upcoming_returns.map((r) => (
                  <li key={r.return_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{r.product_name}</span>
                    <span className="badge badge-danger">{r.days_remaining} days left</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
