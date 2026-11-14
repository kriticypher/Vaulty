// products.js - Product management module (Node.js port of Member 1's products.py).
// Full CRUD with ownership enforcement, plus the same DSA algorithms
// (Merge Sort for sorting, Linear Search for searching).

import { prisma } from './prisma.js';
import { mergeSort, linearSearch } from './dsa.js';

export async function getProductById(productId, userId) {
  return prisma.products.findFirst({
    where: { product_id: productId, user_id: userId }
  });
}

export async function addProduct(userId, data) {
  const name = (data.name || '').trim();
  const brand = (data.brand || '').trim();
  const category = (data.category || '').trim();
  const priceRaw = data.price;
  const purchaseDate = (data.purchase_date || '').trim();
  const description = (data.description || '').trim();

  if (!name) {
    return { success: false, error: 'Product name is required.' };
  }
  if (priceRaw === null || priceRaw === undefined || priceRaw === '') {
    return { success: false, error: 'Price is required.' };
  }
  const price = Number(priceRaw);
  if (Number.isNaN(price)) {
    return { success: false, error: 'Price must be a valid number.' };
  }
  if (price < 0) {
    return { success: false, error: 'Price cannot be negative.' };
  }
  if (!purchaseDate) {
    return { success: false, error: 'Purchase date is required.' };
  }

  try {
    const created = await prisma.products.create({
      data: {
        user_id: userId,
        name,
        brand: brand || null,
        category: category || null,
        price,
        purchase_date: purchaseDate,
        description: description || null
      }
    });
    return { success: true, product_id: created.product_id, product: created };
  } catch (err) {
    return { success: false, error: `Database insertion failed: ${err.message}` };
  }
}

export async function getProductDetails(productId, userId) {
  const product = await getProductById(productId, userId);
  if (!product) {
    return null;
  }

  // Linked records for Members 2 and 3 (same shape as the Python backend)
  const linked = await prisma.products.findUnique({
    where: { product_id: productId },
    include: {
      invoices: true,
      warranties: true,
      returns: true,
      services: { orderBy: { service_date: 'desc' } }
    }
  });

  return {
    product,
    invoices: linked.invoices,
    warranties: linked.warranties,
    returns: linked.returns,
    services: linked.services
  };
}

export async function updateProduct(productId, userId, data) {
  const existing = await getProductById(productId, userId);
  if (!existing) {
    return { success: false, error: 'Product not found or access denied.' };
  }

  const name = (data.name !== undefined && data.name !== '' ? data.name : existing.name).trim();
  const brand = data.brand !== undefined && data.brand !== '' ? data.brand : existing.brand;
  const category = data.category !== undefined && data.category !== '' ? data.category : existing.category;
  const priceRaw = data.price !== undefined ? data.price : existing.price;
  const purchaseDate = (data.purchase_date !== undefined && data.purchase_date !== ''
    ? data.purchase_date : existing.purchase_date).trim();
  const description = data.description !== undefined ? data.description : existing.description;

  if (!name) {
    return { success: false, error: 'Product name cannot be empty.' };
  }
  const price = Number(priceRaw);
  if (Number.isNaN(price)) {
    return { success: false, error: 'Price must be a valid number.' };
  }
  if (price < 0) {
    return { success: false, error: 'Price cannot be negative.' };
  }

  try {
    await prisma.products.update({
      where: { product_id: productId },
      data: { name, brand, category, price, purchase_date: purchaseDate, description }
    });
    return {
      success: true,
      message: 'Product updated successfully.',
      product: await getProductById(productId, userId)
    };
  } catch (err) {
    return { success: false, error: `Update failed: ${err.message}` };
  }
}

export async function deleteProduct(productId, userId) {
  const existing = await getProductById(productId, userId);
  if (!existing) {
    return { success: false, error: 'Product not found or access denied.' };
  }

  try {
    // Prisma relation onDelete: Cascade cleans up Invoices/Warranties/etc.
    await prisma.products.delete({ where: { product_id: productId } });
    return { success: true, message: 'Product deleted successfully.' };
  } catch (err) {
    return { success: false, error: `Deletion failed: ${err.message}` };
  }
}

export async function getAllProducts(userId, { search = '', category = '', minPrice = null, maxPrice = null, sortBy = '' } = {}) {
  // 1. Database retrieval scoped strictly to the user
  let products = await prisma.products.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' }
  });

  // 2. DSA Linear Search on name / brand
  if (search) {
    products = linearSearch(products, search);
  }

  // 3. Category filter
  if (category) {
    products = products.filter(
      (p) => (p.category || '').toLowerCase() === category.toLowerCase()
    );
  }

  // 4. Price range filter
  if (minPrice !== null && minPrice !== undefined) {
    products = products.filter((p) => (p.price ?? 0) >= minPrice);
  }
  if (maxPrice !== null && maxPrice !== undefined) {
    products = products.filter((p) => (p.price ?? 0) <= maxPrice);
  }

  // 5. DSA Merge Sort
  const sorters = {
    price_asc:   { keyFn: (p) => p.price ?? 0, reverse: false },
    price_desc:  { keyFn: (p) => p.price ?? 0, reverse: true },
    date_asc:    { keyFn: (p) => p.purchase_date || '', reverse: false },
    date_desc:   { keyFn: (p) => p.purchase_date || '', reverse: true }
  };
  if (sorters[sortBy]) {
    products = mergeSort(products, sorters[sortBy].keyFn, sorters[sortBy].reverse);
  }

  return products;
}
