import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ProductTable({ products, onDelete }) {
  const navigate = useNavigate();

  if (!products || products.length === 0) {
    return (
      <div className="empty-state card">
        <div className="empty-icon">📦</div>
        <h3>No products found</h3>
        <p>No products match your current filters, or you haven't added any yet.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th>Product Name</th>
            <th>Brand</th>
            <th>Category</th>
            <th>Price</th>
            <th>Purchase Date</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const formattedPrice = new Intl.NumberFormat('en-IN', {
              style: 'currency',
              currency: 'INR',
              maximumFractionDigits: 0
            }).format(p.price);

            return (
              <tr key={p.product_id}>
                <td>
                  <strong style={{ color: '#0f172a' }}>{p.name}</strong>
                  {p.description && (
                    <div style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.description}
                    </div>
                  )}
                </td>
                <td>{p.brand || '—'}</td>
                <td>
                  {p.category ? (
                    <span className="badge badge-primary">{p.category}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{formattedPrice}</td>
                <td>{p.purchase_date}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/products/${p.product_id}`)}
                      type="button"
                    >
                      View
                    </button>
                    {onDelete && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => onDelete(p.product_id)}
                        type="button"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
