// dashboard.js - Dashboard analytics module (Node.js port of Member 1's dashboard.py).
// Aggregations via Prisma groupBy/aggregate plus raw SQL for the Member 3
// reminder hooks (SQLite julianday date math is not expressible in Prisma DSL).

import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

const round2 = (value) => Math.round((value ?? 0) * 100) / 100;
const todayIso = () => new Date().toISOString().slice(0, 10);
const toNumber = (value) => (typeof value === 'bigint' ? Number(value) : value);

export async function getDashboardStats(userId) {
  const today = todayIso();

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

  // 9. Upcoming warranties expiring within 30 days (Member 3 hook)
  const upcomingWarranties = (await prisma.$queryRaw`
    SELECT w.warranty_id, p.product_id, p.name as product_name, w.expiry_date,
           CAST(julianday(w.expiry_date) - julianday(${today}) AS INTEGER) as days_remaining
    FROM Warranties w
    JOIN Products p ON w.product_id = p.product_id
    WHERE p.user_id = ${userId}
      AND julianday(w.expiry_date) >= julianday(${today})
      AND julianday(w.expiry_date) <= julianday(${today}, '+30 days')
    ORDER BY w.expiry_date ASC
  `).map((row) => ({ ...row, days_remaining: toNumber(row.days_remaining) }));

  // 10. Upcoming return deadlines within 7 days (Member 3 hook)
  const upcomingReturns = (await prisma.$queryRaw`
    SELECT r.return_id, p.product_id, p.name as product_name, r.return_deadline, r.return_status,
           CAST(julianday(r.return_deadline) - julianday(${today}) AS INTEGER) as days_remaining
    FROM Returns r
    JOIN Products p ON r.product_id = p.product_id
    WHERE p.user_id = ${userId}
      AND r.return_status = 'Pending'
      AND julianday(r.return_deadline) >= julianday(${today})
      AND julianday(r.return_deadline) <= julianday(${today}, '+7 days')
    ORDER BY r.return_deadline ASC
  `).map((row) => ({ ...row, days_remaining: toNumber(row.days_remaining) }));

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
    upcoming_returns: upcomingReturns
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
