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
import { authService } from './services/authService';
import { api } from './services/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = authService.getToken();
    const storedUser = authService.getUser();

    if (token && storedUser) {
      setUser(storedUser);
    }
    setLoading(false);
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
              <Route
                path="/warranties"
                element={
                  <PlaceholderPage
                    title="Warranty Tracker"
                    member="Member 3 (Warranties & Reminders)"
                    description="Monitor active, expiring soon, and expired product warranties."
                    plannedFeatures={[
                      'Automatic expiry date calculation',
                      'Active vs Expiring Soon (≤30 days) vs Expired status',
                      'In-app reminders on application open',
                      'Nearest expiry sorting'
                    ]}
                  />
                }
              />
              <Route
                path="/returns"
                element={
                  <PlaceholderPage
                    title="Return Windows"
                    member="Member 3 (Warranties & Reminders)"
                    description="Track return deadlines and statuses for recently ordered items."
                    plannedFeatures={[
                      'Return deadline reminders (≤3 days remaining)',
                      'Mark as Returned / Non-returnable',
                      'Seller-specific custom return policy windows'
                    ]}
                  />
                }
              />
              <Route
                path="/service-history"
                element={
                  <PlaceholderPage
                    title="Service & Repair History"
                    member="Member 3 (Warranties & Reminders)"
                    description="Log service records, maintenance fees, and repair center notes."
                    plannedFeatures={[
                      'Log maintenance dates and service center details',
                      'Track individual repair costs',
                      'Total maintenance expenditure per product'
                    ]}
                  />
                }
              />

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
