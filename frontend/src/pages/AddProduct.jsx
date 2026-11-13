import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const categories = [
  'Electronics',
  'Appliances',
  'Furniture',
  'Clothing & Apparel',
  'Books & Stationery',
  'Fitness & Sports',
  'Automotive',
  'Home & Kitchen',
  'Other'
];

export default function AddProduct() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category: 'Electronics',
    price: '',
    purchase_date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Product name is required.');
      return;
    }

    const numPrice = parseFloat(formData.price);
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Please enter a valid positive purchase price.');
      return;
    }

    if (!formData.purchase_date) {
      setError('Purchase date is required.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/api/products', {
        ...formData,
        price: numPrice
      });

      if (res.success) {
        navigate('/products');
      } else {
        setError(res.error || 'Failed to save product.');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Add New Product</h1>
          <p className="page-subtitle">Record a new purchase to track warranties and receipts</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '640px' }}>
        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Product Name *</label>
            <input
              id="name"
              name="name"
              type="text"
              className="form-control"
              placeholder="e.g. Sony WH-1000XM5 Headphones"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="brand">Brand / Manufacturer</label>
              <input
                id="brand"
                name="brand"
                type="text"
                className="form-control"
                placeholder="e.g. Sony, Apple, Samsung"
                value={formData.brand}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                name="category"
                className="form-control"
                value={formData.category}
                onChange={handleChange}
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="price">Purchase Price (₹) *</label>
              <input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                placeholder="29990"
                value={formData.price}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="purchase_date">Purchase Date *</label>
              <input
                id="purchase_date"
                name="purchase_date"
                type="date"
                className="form-control"
                value={formData.purchase_date}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description">Notes / Description (Optional)</label>
            <textarea
              id="description"
              name="description"
              className="form-control"
              rows={3}
              placeholder="Store purchased from, order ID, serial number, notes..."
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? 'Saving Product...' : 'Save Product to Vault'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/products')}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
