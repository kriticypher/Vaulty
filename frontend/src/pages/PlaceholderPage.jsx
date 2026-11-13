import React from 'react';

export default function PlaceholderPage({ title, member, description, plannedFeatures }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Module allocated to {member}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '800px' }}>
        <div className="empty-state">
          <div className="empty-icon">🚧</div>
          <h3>Under Construction by {member}</h3>
          <p style={{ maxWidth: '500px', margin: '0.5rem auto 1.5rem auto' }}>
            {description || `This module is part of ${member}'s major project milestone. The underlying shared database schemas and API specifications are established.`}
          </p>

          {plannedFeatures && plannedFeatures.length > 0 && (
            <div style={{ textAlign: 'left', background: '#f8fafc', padding: '1.25rem', borderRadius: '10px', marginTop: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#0f172a' }}>Planned Module Features:</h4>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {plannedFeatures.map((feat, idx) => (
                  <li key={idx}>{feat}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
