import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import ProductTable from '../components/ProductTable';
import ProductCard from '../components/ProductCard';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'

  const navigate = useNavigate();

  const loadProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/api/products');
      setProducts(data.products || []);
    } catch (err) {
      setError(err.message || 'Could not fetch products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return;
    }
    try {
      await api.delete(`/api/products/${productId}`);
      setProducts((prev) => prev.filter((p) => p.product_id !== productId));
    } catch (err) {
      alert(err.message || 'Failed to delete product.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchased Products</h1>
          <p className="page-subtitle">
            {products.length} {products.length === 1 ? 'item' : 'items'} registered in your vault
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '8px', padding: '2px' }}>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'table' ? 'btn-secondary' : ''}`}
              style={{ background: viewMode === 'table' ? '#fff' : 'transparent', border: 'none' }}
              onClick={() => setViewMode('table')}
            >
              📑 Table
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-secondary' : ''}`}
              style={{ background: viewMode === 'grid' ? '#fff' : 'transparent', border: 'none' }}
              onClick={() => setViewMode('grid')}
            >
              ⊞ Grid
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => navigate('/products/add')}
            type="button"
          >
            + Add Product
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="card empty-state">
          <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
          <p>Loading your products...</p>
        </div>
      ) : viewMode === 'table' ? (
        <ProductTable products={products} onDelete={handleDelete} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {products.map((p) => (
            <ProductCard key={p.product_id} product={p} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
