import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ProductCard({ product, onDelete }) {
  const navigate = useNavigate();

  const formattedPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(product.price);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{product.name}</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>{product.brand || 'No brand'}</p>
        </div>
        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563eb' }}>
          {formattedPrice}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {product.category && <span className="badge badge-primary">{product.category}</span>}
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>📅 Purchased: {product.purchase_date}</span>
      </div>

      {product.description && (
        <p style={{ fontSize: '0.85rem', color: '#475569', lineClamp: 2, overflow: 'hidden' }}>
          {product.description}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
        <button
          className="btn btn-secondary btn-sm"
          style={{ flex: 1 }}
          onClick={() => navigate(`/products/${product.product_id}`)}
          type="button"
        >
          View Details
        </button>
        {onDelete && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onDelete(product.product_id)}
            type="button"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
