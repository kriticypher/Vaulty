import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import AddProduct from './pages/AddProduct';
import ProductDetails from './pages/ProductDetails';
import Invoices from './pages/Invoices';
import InvoiceDetails from './pages/InvoiceDetails';
import Analytics from './pages/Analytics';
import Profile from './pages/Profile';
import PlaceholderPage from './pages/PlaceholderPage';
import Warranties from './pages/Warranties';
import Returns from './pages/Returns';
import ServiceHistory from './pages/ServiceHistory';
import { authService } from './services/authService';
import { api } from './services/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session restore: ask the server (cookie/Bearer session) instead of
    // trusting localStorage, so 7-day sessions survive server restarts.
    const restoreSession = async () => {
      try {
        const data = await api.get('/api/me');
        setUser(data.user);
        localStorage.setItem('vaultly_user', JSON.stringify(data.user));
      } catch {
        authService.clearSession();
        setUser(null);
      }
      setLoading(false);
    };
    restoreSession();
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('vaultly_token', token);
    localStorage.setItem('vaultly_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/logout');
    } catch {
      // Ignore network errors on logout
    }
    authService.clearSession();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="loading-spinner-full">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      {user ? (
        <div className="app-layout">
          <Sidebar user={user} onLogout={handleLogout} />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/add" element={<AddProduct />} />
              <Route path="/products/:id" element={<ProductDetails />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/profile" element={<Profile user={user} />} />

              {/* Member 2: Invoices & Receipts (replaces the integration placeholder) */}
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/:id" element={<InvoiceDetails />} />

              {/* Shared integration placeholder routes for Member 3 */}
              <Route path="/warranties" element={<Warranties />} />
              <Route path="/returns" element={<Returns />} />
              <Route path="/service-history" element={<ServiceHistory />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      ) : (
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/register" element={<Register onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
