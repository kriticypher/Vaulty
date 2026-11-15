// dashboard.js - Dashboard analytics module (Node.js port of Member 1's dashboard.py).
// Aggregations via Prisma groupBy/aggregate plus raw SQL for the Member 3
// reminder hooks (SQLite julianday date math is not expressible in Prisma DSL).

import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

const round2 = (value) => Math.round((value ?? 0) * 100) / 100;
const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const isoDate = (date) => date.toISOString().slice(0, 10);
const daysUntil = (dateString, today) => {
  if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const target = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime()) || target.toISOString().slice(0, 10) !== dateString) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

export async function getDashboardStats(userId) {
  const today = todayUtc();
  const todayString = isoDate(today);

  // 1-4. Counts and sums in a single aggregate query
  const totals = await prisma.products.aggregate({
    where: { user_id: userId },
    _count: { product_id: true },
    _sum: { price: true },
    _avg: { price: true }
  });

  // 5. Most expensive product
  const mostExpensive = await prisma.products.findFirst({
    where: { user_id: userId },
    orderBy: { price: 'desc' },
    select: { product_id: true, name: true, brand: true, price: true, category: true }
  });

  // 6. Recently added products (5 most recent)
  const recentProducts = await prisma.products.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 5,
    select: { product_id: true, name: true, brand: true, category: true, price: true, purchase_date: true }
  });

  // 7. Category-wise spending (Prisma GROUP BY)
  const categoryGroups = await prisma.products.groupBy({
    by: ['category'],
    where: { user_id: userId, NOT: { OR: [{ category: null }, { category: '' }] } },
    _count: { product_id: true },
    _sum: { price: true }
  });
  const categorySpending = categoryGroups
    .map((g) => ({
      category: g.category,
      product_count: g._count.product_id,
      total_spent: round2(g._sum.price)
    }))
    .sort((a, b) => b.total_spent - a.total_spent);

  // 8. Monthly purchase spending (grouped by YYYY-MM in JS, newest month first)
  const priced = await prisma.products.findMany({
    where: { user_id: userId },
    select: { purchase_date: true, price: true }
  });
  const monthMap = new Map(); // DSA: hash map aggregation, O(n)
  for (const row of priced) {
    const month = String(row.purchase_date).slice(0, 7);
    const entry = monthMap.get(month) || { month, product_count: 0, total: 0 };
    entry.product_count += 1;
    entry.total += row.price;
    monthMap.set(month, entry);
  }
  const monthlySpending = [...monthMap.values()]
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12)
    .map((m) => ({ month: m.month, product_count: m.product_count, total_spent: round2(m.total) }));

  // 9-10. Member 3 reminder inputs. Read through Prisma and calculate from
  // UTC calendar dates so local browser/server timezones cannot shift a day.
  const [warrantyRows, returnRows] = await Promise.all([
    prisma.warranties.findMany({
      where: { product: { user_id: userId } },
      include: { product: { select: { product_id: true, name: true } } }
    }),
    prisma.returns.findMany({
      where: { product: { user_id: userId } },
      include: { product: { select: { product_id: true, name: true } } }
    })
  ]);

  const warrantyDates = warrantyRows.map((row) => ({
    warranty_id: row.warranty_id,
    product_id: row.product.product_id,
    product_name: row.product.name,
    expiry_date: row.expiry_date,
    days_remaining: daysUntil(row.expiry_date, today)
  })).filter((row) => row.days_remaining !== null);
  const returnDates = returnRows.map((row) => ({
    return_id: row.return_id,
    product_id: row.product.product_id,
    product_name: row.product.name,
    return_deadline: row.return_deadline,
    return_status: row.return_status,
    days_remaining: daysUntil(row.return_deadline, today)
  })).filter((row) => row.days_remaining !== null);

  // Keep the pre-existing response fields and their original windows for
  // clients that still consume them.
  const upcomingWarranties = warrantyDates
    .filter((row) => row.days_remaining >= 0 && row.days_remaining <= 30)
    .sort((a, b) => a.days_remaining - b.days_remaining);
  const upcomingReturns = returnDates
    .filter((row) => row.return_status === 'Pending' && row.days_remaining >= 0 && row.days_remaining <= 7)
    .sort((a, b) => a.days_remaining - b.days_remaining);

  // A warranty in the 1-7 day window gets one urgent reminder, not a second
  // generic 30-day reminder. Each persisted record is added at most once.
  const reminders = [];
  for (const warranty of warrantyDates) {
    let kind = '';
    let message = '';
    if (warranty.days_remaining <= 0) {
      kind = 'warranty_expired';
      message = 'Warranty has expired';
    } else if (warranty.days_remaining <= 7) {
      kind = 'warranty_urgent';
      message = 'Warranty expires within 7 days';
    } else if (warranty.days_remaining <= 30) {
      kind = 'warranty_soon';
      message = 'Warranty expires within 30 days';
    }
    if (kind) reminders.push({
      reminder_id: `warranty-${warranty.warranty_id}`,
      type: 'warranty',
      kind,
      product_id: warranty.product_id,
      product_name: warranty.product_name,
      date: warranty.expiry_date,
      days_remaining: warranty.days_remaining,
      message,
      module_path: '/warranties',
      product_path: `/products/${warranty.product_id}`
    });
  }
  for (const returnWindow of returnDates) {
    let kind = '';
    let message = '';
    if (returnWindow.return_status === 'Closed') {
      kind = 'return_closed';
      message = 'Return window is closed';
    } else if (returnWindow.return_status === 'Pending' && returnWindow.days_remaining < 0) {
      kind = 'return_expired';
      message = 'Return deadline has passed';
    } else if (returnWindow.return_status === 'Pending' && returnWindow.days_remaining <= 3) {
      kind = 'return_approaching';
      message = 'Return deadline is approaching';
    }
    if (kind) reminders.push({
      reminder_id: `return-${returnWindow.return_id}`,
      type: 'return',
      kind,
      product_id: returnWindow.product_id,
      product_name: returnWindow.product_name,
      date: returnWindow.return_deadline,
      days_remaining: returnWindow.days_remaining,
      return_status: returnWindow.return_status,
      message,
      module_path: '/returns',
      product_path: `/products/${returnWindow.product_id}`
    });
  }
  const uniqueReminders = [...new Map(reminders.map((reminder) => [reminder.reminder_id, reminder])).values()]
    .sort((a, b) => a.days_remaining - b.days_remaining || a.product_name.localeCompare(b.product_name));

  return {
    total_products: totals._count.product_id,
    total_spending: round2(totals._sum.price),
    total_categories: categoryGroups.length,
    avg_price: round2(totals._avg.price),
    most_expensive: mostExpensive,
    recent_products: recentProducts,
    category_spending: categorySpending,
    monthly_spending: monthlySpending,
    upcoming_warranties: upcomingWarranties,
    upcoming_returns: upcomingReturns,
    reminders: uniqueReminders,
    reminders_checked_on: todayString
  };
}

export async function getAnalyticsData(userId) {
  const stats = await getDashboardStats(userId);
  return {
    total_spending: stats.total_spending,
    total_products: stats.total_products,
    avg_price: stats.avg_price,
    most_expensive: stats.most_expensive,
    category_spending: stats.category_spending,
    monthly_spending: stats.monthly_spending
  };
}

// Re-export so raw SQL helpers stay referenced if future modules need them
export { Prisma };
