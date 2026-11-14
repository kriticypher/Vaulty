// Return-window tracking for Member 3. Deadlines are entered by the user
// because return policies vary by seller.
import { prisma } from './prisma.js';
import { mergeSort } from './dsa.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RETURN_STATUSES = new Set(['Pending', 'Returned', 'Non-returnable', 'Closed']);

function parseDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function remainingDays(deadline) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.ceil((parseDate(deadline).getTime() - today.getTime()) / 86_400_000);
}

function shapeReturn(record) {
  return { ...record, remaining_days: remainingDays(record.return_deadline) };
}

function validateDeadline(deadline, purchaseDate) {
  if (!parseDate(deadline)) return 'Return deadline must be a valid date in YYYY-MM-DD format.';
  if (parseDate(purchaseDate) && deadline < purchaseDate) return 'Return deadline cannot be earlier than the product purchase date.';
  return '';
}

export async function listReturns(userId) {
  const records = await prisma.returns.findMany({
    where: { product: { user_id: userId } },
    include: { product: { select: { product_id: true, name: true, brand: true, purchase_date: true } } }
  });
  return mergeSort(records.map(shapeReturn), (record) => `${record.return_status === 'Pending' && record.remaining_days >= 0 ? '0' : '1'}:${record.return_deadline}`);
}

export async function listProductReturns(productId, userId) {
  const product = await prisma.products.findFirst({ where: { product_id: productId, user_id: userId } });
  if (!product) return null;
  const returns = await prisma.returns.findMany({ where: { product_id: productId }, orderBy: { return_deadline: 'asc' } });
  return { product, returns: returns.map(shapeReturn) };
}

export async function createReturn(productId, userId, data) {
  const product = await prisma.products.findFirst({ where: { product_id: productId, user_id: userId } });
  if (!product) return { success: false, error: 'Product not found or access denied.', status: 404 };
  const deadline = String(data.return_deadline || '').trim();
  const validationError = validateDeadline(deadline, product.purchase_date);
  if (validationError) return { success: false, error: validationError, status: 400 };
  const returnStatus = data.return_status === undefined ? 'Pending' : String(data.return_status);
  if (!RETURN_STATUSES.has(returnStatus)) return { success: false, error: 'Invalid return status.' , status: 400 };
  const record = await prisma.returns.create({ data: { product_id: productId, return_deadline: deadline, return_status: returnStatus } });
  return { success: true, message: 'Return window added successfully.', return: shapeReturn(record) };
}

export async function getReturn(returnId, userId) {
  const record = await prisma.returns.findFirst({
    where: { return_id: returnId, product: { user_id: userId } },
    include: { product: { select: { product_id: true, name: true, brand: true, purchase_date: true } } }
  });
  return record ? shapeReturn(record) : null;
}

export async function updateReturn(returnId, userId, data) {
  const existing = await prisma.returns.findFirst({ where: { return_id: returnId, product: { user_id: userId } }, include: { product: true } });
  if (!existing) return { success: false, error: 'Return window not found or access denied.', status: 404 };
  const deadline = data.return_deadline === undefined ? existing.return_deadline : String(data.return_deadline).trim();
  const validationError = validateDeadline(deadline, existing.product.purchase_date);
  if (validationError) return { success: false, error: validationError, status: 400 };
  const returnStatus = data.return_status === undefined ? existing.return_status : String(data.return_status);
  if (!RETURN_STATUSES.has(returnStatus)) return { success: false, error: 'Invalid return status.', status: 400 };
  const record = await prisma.returns.update({ where: { return_id: returnId }, data: { return_deadline: deadline, return_status: returnStatus } });
  return { success: true, message: 'Return window updated successfully.', return: shapeReturn(record) };
}

export async function deleteReturn(returnId, userId) {
  const existing = await prisma.returns.findFirst({ where: { return_id: returnId, product: { user_id: userId } } });
  if (!existing) return { success: false, error: 'Return window not found or access denied.' };
  await prisma.returns.delete({ where: { return_id: returnId } });
  return { success: true, message: 'Return window deleted successfully.' };
}
