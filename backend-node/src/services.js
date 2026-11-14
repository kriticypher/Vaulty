// Product service and repair history for Member 3.
import { prisma } from './prisma.js';
import { mergeSort } from './dsa.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeInput(data, existing = null) {
  const serviceDate = data.service_date === undefined ? existing?.service_date : String(data.service_date).trim();
  if (!validDate(serviceDate)) return { error: 'Service date must be a valid date in YYYY-MM-DD format.' };
  const serviceCenter = data.service_center === undefined ? existing?.service_center : String(data.service_center).trim();
  const description = data.description === undefined ? existing?.description : String(data.description).trim();
  let cost = data.cost === undefined ? existing?.cost : data.cost;
  if (cost === '' || cost === null) cost = null;
  if (cost !== null && cost !== undefined) {
    cost = Number(cost);
    if (!Number.isFinite(cost) || cost < 0) return { error: 'Service cost must be a valid non-negative amount.' };
  }
  return {
    service_date: serviceDate,
    service_center: serviceCenter || null,
    cost: cost ?? null,
    description: description || null
  };
}

function sortRecords(records) {
  return mergeSort(records, (record) => record.service_date, true);
}

export async function listProductServices(productId, userId) {
  const product = await prisma.products.findFirst({ where: { product_id: productId, user_id: userId } });
  if (!product) return null;
  const records = await prisma.serviceRecords.findMany({ where: { product_id: productId } });
  const services = sortRecords(records);
  const total_expenditure = services.reduce((sum, record) => sum + (record.cost || 0), 0);
  return { product, services, total_expenditure: Math.round(total_expenditure * 100) / 100 };
}

export async function createService(productId, userId, data) {
  const product = await prisma.products.findFirst({ where: { product_id: productId, user_id: userId } });
  if (!product) return { success: false, error: 'Product not found or access denied.', status: 404 };
  const values = normalizeInput(data);
  if (values.error) return { success: false, error: values.error, status: 400 };
  const service = await prisma.serviceRecords.create({ data: { product_id: productId, ...values } });
  return { success: true, message: 'Service record added successfully.', service };
}

export async function updateService(serviceId, userId, data) {
  const existing = await prisma.serviceRecords.findFirst({ where: { service_id: serviceId, product: { user_id: userId } } });
  if (!existing) return { success: false, error: 'Service record not found or access denied.', status: 404 };
  const values = normalizeInput(data, existing);
  if (values.error) return { success: false, error: values.error, status: 400 };
  const service = await prisma.serviceRecords.update({ where: { service_id: serviceId }, data: values });
  return { success: true, message: 'Service record updated successfully.', service };
}

export async function deleteService(serviceId, userId) {
  const existing = await prisma.serviceRecords.findFirst({ where: { service_id: serviceId, product: { user_id: userId } } });
  if (!existing) return { success: false, error: 'Service record not found or access denied.' };
  await prisma.serviceRecords.delete({ where: { service_id: serviceId } });
  return { success: true, message: 'Service record deleted successfully.' };
}
