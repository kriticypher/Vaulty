import React from 'react';

export default function Profile({ user }) {
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Profile</h1>
          <p className="page-subtitle">Account credentials and member details</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '2rem' }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            color: '#fff',
            fontSize: '1.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {initial}
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>{user?.name || 'User'}</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{user?.email || 'N/A'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label>User ID</label>
            <input className="form-control" value={user?.user_id || '1'} readOnly style={{ background: '#f8fafc' }} />
          </div>

          <div className="form-group">
            <label>Registered Name</label>
            <input className="form-control" value={user?.name || ''} readOnly style={{ background: '#f8fafc' }} />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input className="form-control" value={user?.email || ''} readOnly style={{ background: '#f8fafc' }} />
          </div>

          <div style={{ padding: '1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#065f46', fontWeight: 600 }}>
              🛡️ Security Status: Account authenticated with PBKDF2-HMAC-SHA256 salted credentials.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
