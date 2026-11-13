import React from 'react';

export default function StatCard({ icon, label, value, subtitle }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {subtitle && <div className="stat-subtitle" style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{subtitle}</div>}
      </div>
    </div>
  );
}
