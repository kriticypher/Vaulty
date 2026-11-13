import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import StatCard from '../components/StatCard';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/analytics');
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="card empty-state">
        <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
        <p>Crunching SQL analytics data...</p>
      </div>
    );
  }

  if (error || !data) {
    return <div className="alert alert-danger">{error || 'Unable to load analytics.'}</div>;
  }

  const formattedSpending = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(data.total_spending || 0);

  const formattedAvg = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(data.avg_price || 0);

  const highestName = data.most_expensive ? data.most_expensive.name : 'None';
  const highestVal = data.most_expensive
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
      }).format(data.most_expensive.price)
    : '₹0';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Analytics</h1>
          <p className="page-subtitle">Detailed breakdown of category expenditure and monthly purchase trends</p>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon="💰" label="Total Spending" value={formattedSpending} />
        <StatCard icon="📊" label="Average Price" value={formattedAvg} />
        <StatCard icon="🏆" label="Highest Single Purchase" value={highestVal} subtitle={highestName} />
      </div>

      {/* Category-Wise Spending Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            Spending Distribution by Category (SQL GROUP BY)
          </h3>
          {data.category_spending && data.category_spending.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {data.category_spending.map((cat) => {
                const percent = data.total_spending > 0
                  ? Math.round((cat.total_spent / data.total_spending) * 100)
                  : 0;

                return (
                  <div key={cat.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 600 }}>{cat.category}</span>
                      <span style={{ color: '#475569' }}>
                        {cat.product_count} {cat.product_count === 1 ? 'item' : 'items'} • ₹{cat.total_spent.toLocaleString('en-IN')} ({percent}%)
                      </span>
                    </div>
                    <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${percent}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p>No category purchases logged yet.</p>
            </div>
          )}
        </div>

        {/* Monthly Spending History */}
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            Monthly Purchase Activity (Last 12 Months)
          </h3>
          {data.monthly_spending && data.monthly_spending.length > 0 ? (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Month (YYYY-MM)</th>
                    <th>Products</th>
                    <th style={{ textAlign: 'right' }}>Total Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly_spending.map((m) => (
                    <tr key={m.month}>
                      <td style={{ fontWeight: 600 }}>📅 {m.month}</td>
                      <td>{m.product_count} purchases</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>
                        ₹{m.total_spent.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>No monthly purchase records found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
