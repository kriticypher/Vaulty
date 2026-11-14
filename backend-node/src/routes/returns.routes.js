import { Router } from 'express';
import { getUserIdFromRequest } from '../auth.js';
import { listReturns, listProductReturns, createReturn, getReturn, updateReturn, deleteReturn } from '../returns.js';

export const returns = Router();

async function requireUser(req, res) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) res.status(401).json({ error: 'Authentication required. Please login.' });
  return userId;
}

function parseId(value, res, type) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: `Invalid ${type} ID format.` }); return null; }
  return id;
}

returns.get('/returns', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  return res.json({ returns: await listReturns(userId) });
});

returns.get('/products/:id/returns', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const productId = parseId(req.params.id, res, 'product'); if (!productId) return;
  const result = await listProductReturns(productId, userId);
  if (!result) return res.status(404).json({ error: 'Product not found or access denied.' });
  return res.json(result);
});

returns.post('/products/:id/returns', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const productId = parseId(req.params.id, res, 'product'); if (!productId) return;
  const result = await createReturn(productId, userId, req.body || {});
  return res.status(result.status || 201).json(result);
});

returns.get('/returns/:id', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const returnId = parseId(req.params.id, res, 'return'); if (!returnId) return;
  const record = await getReturn(returnId, userId);
  if (!record) return res.status(404).json({ error: 'Return window not found or access denied.' });
  return res.json({ return: record });
});

returns.put('/returns/:id', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const returnId = parseId(req.params.id, res, 'return'); if (!returnId) return;
  const result = await updateReturn(returnId, userId, req.body || {});
  return res.status(result.status || 200).json(result);
});

returns.delete('/returns/:id', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const returnId = parseId(req.params.id, res, 'return'); if (!returnId) return;
  const result = await deleteReturn(returnId, userId);
  return res.status(result.success ? 200 : 404).json(result);
});
