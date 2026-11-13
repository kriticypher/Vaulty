import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/products', label: 'Products', icon: '📦' },
  { to: '/invoices', label: 'Invoices', icon: '🧾' },
  { to: '/warranties', label: 'Warranties', icon: '🛡️' },
  { to: '/returns', label: 'Returns', icon: '↩️' },
  { to: '/service-history', label: 'Service History', icon: '🔧' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export default function Sidebar({ user, onLogout }) {
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/vaulty-logo.png" alt="Vaultly logo" className="brand-logo-img" />
        <span className="brand-name">Vaultly</span>
      </div>

      <div className="sidebar-user">
        <div className="user-avatar">{initial}</div>
        <div>
          <div className="user-name">{user?.name || 'User'}</div>
          <div className="user-email">{user?.email || 'user@vaultly.com'}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <button className="sidebar-logout" onClick={onLogout} type="button">
        <span>🚪</span> Logout
      </button>
    </aside>
  );
}
