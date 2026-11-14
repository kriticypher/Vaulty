// Warranty management for Member 3. Dates are stored as YYYY-MM-DD strings,
// matching the shared Prisma schema and the other Vaultly modules.
import { prisma } from './prisma.js';
import { mergeSort } from './dsa.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function addMonths(startDate, months) {
  const result = new Date(startDate);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result.toISOString().slice(0, 10);
}

function remainingDays(expiryDate) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.ceil((parseDate(expiryDate).getTime() - today.getTime()) / 86_400_000);
}

function shapeWarranty(warranty) {
  const days = remainingDays(warranty.expiry_date);
  const status = days <= 0 ? 'Expired' : days <= 30 ? 'Expiring Soon' : 'Active';
  return { ...warranty, remaining_days: days, status };
}

// Keep upcoming dates in nearest-first order; expired records follow them.
// This remains a hand-written merge sort for the project's DSA requirement.
function sortByNearestExpiry(records) {
  return mergeSort(records, (warranty) => `${warranty.remaining_days <= 0 ? '1' : '0'}:${warranty.expiry_date}`);
}

function validateInput(data, existing = null) {
  const startDate = data.start_date === undefined ? existing?.start_date : String(data.start_date).trim();
  const durationRaw = data.duration_months === undefined ? existing?.duration_months : data.duration_months;
  const duration = Number(durationRaw);
  if (!parseDate(startDate)) return { error: 'Start date must be a valid date in YYYY-MM-DD format.' };
  if (!Number.isInteger(duration) || duration < 1 || duration > 1200) {
    return { error: 'Warranty duration must be a whole number of months between 1 and 1200.' };
  }
  return { start_date: startDate, duration_months: duration, expiry_date: addMonths(parseDate(startDate), duration) };
}

export async function listWarranties(userId) {
  const records = await prisma.warranties.findMany({
    where: { product: { user_id: userId } },
    include: { product: { select: { product_id: true, name: true, brand: true } } }
  });
  return sortByNearestExpiry(records.map(shapeWarranty));
}

export async function listProductWarranties(productId, userId) {
  const product = await prisma.products.findFirst({ where: { product_id: productId, user_id: userId } });
  if (!product) return null;
  const records = await prisma.warranties.findMany({ where: { product_id: productId } });
  return { product, warranties: records.map(shapeWarranty) };
}

export async function createWarranty(productId, userId, data) {
  const product = await prisma.products.findFirst({ where: { product_id: productId, user_id: userId } });
  if (!product) return { success: false, error: 'Product not found or access denied.' };
  const values = validateInput(data);
  if (values.error) return { success: false, error: values.error };
  const warranty = await prisma.warranties.create({ data: { product_id: productId, ...values } });
  return { success: true, message: 'Warranty added successfully.', warranty: shapeWarranty(warranty) };
}

export async function getWarranty(warrantyId, userId) {
  const warranty = await prisma.warranties.findFirst({
    where: { warranty_id: warrantyId, product: { user_id: userId } },
    include: { product: { select: { product_id: true, name: true, brand: true } } }
  });
  return warranty ? shapeWarranty(warranty) : null;
}

export async function updateWarranty(warrantyId, userId, data) {
  const existing = await prisma.warranties.findFirst({ where: { warranty_id: warrantyId, product: { user_id: userId } } });
  if (!existing) return { success: false, error: 'Warranty not found or access denied.' };
  const values = validateInput(data, existing);
  if (values.error) return { success: false, error: values.error };
  const warranty = await prisma.warranties.update({ where: { warranty_id: warrantyId }, data: values });
  return { success: true, message: 'Warranty updated successfully.', warranty: shapeWarranty(warranty) };
}

export async function deleteWarranty(warrantyId, userId) {
  const existing = await prisma.warranties.findFirst({ where: { warranty_id: warrantyId, product: { user_id: userId } } });
  if (!existing) return { success: false, error: 'Warranty not found or access denied.' };
  await prisma.warranties.delete({ where: { warranty_id: warrantyId } });
  return { success: true, message: 'Warranty deleted successfully.' };
}
