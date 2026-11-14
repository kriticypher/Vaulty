import { Router } from 'express';
import { getUserIdFromRequest } from '../auth.js';
import { listProductServices, createService, updateService, deleteService } from '../services.js';

export const services = Router();

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

services.get('/products/:id/services', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const productId = parseId(req.params.id, res, 'product'); if (!productId) return;
  const result = await listProductServices(productId, userId);
  if (!result) return res.status(404).json({ error: 'Product not found or access denied.' });
  return res.json(result);
});

services.post('/products/:id/services', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const productId = parseId(req.params.id, res, 'product'); if (!productId) return;
  const result = await createService(productId, userId, req.body || {});
  return res.status(result.status || 201).json(result);
});

services.put('/services/:id', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const serviceId = parseId(req.params.id, res, 'service'); if (!serviceId) return;
  const result = await updateService(serviceId, userId, req.body || {});
  return res.status(result.status || 200).json(result);
});

services.delete('/services/:id', async (req, res) => {
  const userId = await requireUser(req, res); if (!userId) return;
  const serviceId = parseId(req.params.id, res, 'service'); if (!serviceId) return;
  const result = await deleteService(serviceId, userId);
  return res.status(result.success ? 200 : 404).json(result);
});
