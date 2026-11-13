// dashboard.routes.js - Dashboard & analytics endpoints (Node.js port).

import { Router } from 'express';
import { getUserIdFromToken } from '../auth.js';
import { getDashboardStats, getAnalyticsData } from '../dashboard.js';

export const dashboard = Router();

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function requireUser(req, res) {
  const userId = getUserIdFromToken(getBearerToken(req));
  if (!userId) {
    res.status(401).json({ error: 'Authentication required. Please login.' });
    return null;
  }
  return userId;
}

dashboard.get('/dashboard', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  return res.json(await getDashboardStats(userId));
});

dashboard.get('/analytics', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  return res.json(await getAnalyticsData(userId));
});
