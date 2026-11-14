// products.routes.js - Product CRUD endpoints (Node.js port of Member 1's routes).

import { Router } from 'express';
import { getUserIdFromRequest } from '../auth.js';
import {
  addProduct,
  getAllProducts,
  getProductDetails,
  updateProduct,
  deleteProduct
} from '../products.js';

export const products = Router();

async function requireUser(req, res) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required. Please login.' });
    return null;
  }
  return userId;
}

// GET /api/products — search / filter / sort (DSA algorithms inside)
products.get('/products', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const minPrice = req.query.min_price ? Number(req.query.min_price) : null;
  const maxPrice = req.query.max_price ? Number(req.query.max_price) : null;

  const list = await getAllProducts(userId, {
    search: req.query.search || '',
    category: req.query.category || '',
    minPrice: Number.isNaN(minPrice) ? null : minPrice,
    maxPrice: Number.isNaN(maxPrice) ? null : maxPrice,
    sortBy: req.query.sort_by || ''
  });
  return res.json({ products: list });
});

// POST /api/products
products.post('/products', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const result = await addProduct(userId, req.body || {});
  return res.status(result.success ? 201 : 400).json(result);
});

// GET /api/products/:id — details with linked records (Members 2 & 3)
products.get('/products/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const productId = Number(req.params.id);
  if (Number.isNaN(productId)) {
    return res.status(400).json({ error: 'Invalid product ID format.' });
  }

  const details = await getProductDetails(productId, userId);
  if (!details) {
    return res.status(404).json({ error: 'Product not found or access denied.' });
  }
  return res.json(details);
});

// PUT /api/products/:id
products.put('/products/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const productId = Number(req.params.id);
  if (Number.isNaN(productId)) {
    return res.status(400).json({ error: 'Invalid product ID format.' });
  }

  const result = await updateProduct(productId, userId, req.body || {});
  return res.status(result.success ? 200 : 400).json(result);
});

// DELETE /api/products/:id (cascades to linked records)
products.delete('/products/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const productId = Number(req.params.id);
  if (Number.isNaN(productId)) {
    return res.status(400).json({ error: 'Invalid product ID format.' });
  }

  const result = await deleteProduct(productId, userId);
  return res.status(result.success ? 200 : 404).json(result);
});
