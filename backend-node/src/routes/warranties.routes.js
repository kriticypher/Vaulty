// Member 3 warranty routes. All operations use Prisma and are scoped to the
// authenticated user's products, following the existing Vaultly API pattern.
import { Router } from 'express';
import { getUserIdFromRequest } from '../auth.js';
import { listWarranties, listProductWarranties, createWarranty, getWarranty, updateWarranty, deleteWarranty } from '../warranties.js';

export const warranties = Router();

async function requireUser(req, res) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) res.status(401).json({ error: 'Authentication required. Please login.' });
  return userId;
}

function idParam(value, res, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: `Invalid ${label} ID format.` });
    return null;
  }
  return id;
}

warranties.get('/warranties', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;
  return res.json({ warranties: await listWarranties(userId) });
});

warranties.get('/products/:id/warranties', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const productId = idParam(req.params.id, res, 'product');
  if (!productId) return;
  const result = await listProductWarranties(productId, userId);
  if (!result) return res.status(404).json({ error: 'Product not found or access denied.' });
  return res.json(result);
});

warranties.post('/products/:id/warranties', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const productId = idParam(req.params.id, res, 'product');
  if (!productId) return;
  const result = await createWarranty(productId, userId, req.body || {});
  return res.status(result.success ? 201 : (result.error.includes('not found') ? 404 : 400)).json(result);
});

warranties.get('/warranties/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const warrantyId = idParam(req.params.id, res, 'warranty');
  if (!warrantyId) return;
  const warranty = await getWarranty(warrantyId, userId);
  if (!warranty) return res.status(404).json({ error: 'Warranty not found or access denied.' });
  return res.json({ warranty });
});

warranties.put('/warranties/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const warrantyId = idParam(req.params.id, res, 'warranty');
  if (!warrantyId) return;
  const result = await updateWarranty(warrantyId, userId, req.body || {});
  return res.status(result.success ? 200 : (result.error.includes('not found') ? 404 : 400)).json(result);
});

warranties.delete('/warranties/:id', async (req, res) => {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const warrantyId = idParam(req.params.id, res, 'warranty');
  if (!warrantyId) return;
  const result = await deleteWarranty(warrantyId, userId);
  return res.status(result.success ? 200 : 404).json(result);
});
