import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import ProductTable from '../components/ProductTable';
import ProductCard from '../components/ProductCard';

const categories = [
  'All Categories',
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

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('table');

  // Filter and Sort states
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const navigate = useNavigate();

  const loadProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        search,
        category: category === 'All Categories' ? '' : category,
        sort_by: sortBy,
        min_price: minPrice,
        max_price: maxPrice
      };
      const data = await api.getProducts(params);
      setProducts(data.products || []);
    } catch (err) {
      setError(err.message || 'Could not fetch products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      loadProducts();
    }, 250);
    return () => clearTimeout(delayDebounce);
  }, [search, category, sortBy, minPrice, maxPrice]);

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

  const handleResetFilters = () => {
    setSearch('');
    setCategory('');
    setSortBy('');
    setMinPrice('');
    setMaxPrice('');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchased Products</h1>
          <p className="page-subtitle">
            {products.length} {products.length === 1 ? 'item' : 'items'} found in your vault
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

      {/* Filter and Search Bar (DSA Search & Sort controls) */}
      <div className="filter-bar">
        <div className="search-input">
          <input
            type="text"
            className="form-control"
            placeholder="🔍 Search by name or brand (Linear Search)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ minWidth: '180px' }}>
          <select
            className="form-control"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat === 'All Categories' ? '' : cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div style={{ minWidth: '180px' }}>
          <select
            className="form-control"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="">Sort (Merge Sort)...</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="date_desc">Purchase Date: Newest First</option>
            <option value="date_asc">Purchase Date: Oldest First</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="number"
            className="form-control"
            placeholder="Min ₹"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            style={{ width: '90px' }}
          />
          <span>–</span>
          <input
            type="number"
            className="form-control"
            placeholder="Max ₹"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            style={{ width: '90px' }}
          />
        </div>

        {(search || category || sortBy || minPrice || maxPrice) && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleResetFilters}
          >
            Clear Filters
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="card empty-state">
          <div className="loading-spinner" style={{ margin: '0 auto 1rem auto' }} />
          <p>Filtering items with Merge Sort & Linear Search...</p>
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
