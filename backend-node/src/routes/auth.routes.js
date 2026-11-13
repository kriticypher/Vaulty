// auth.routes.js - Authentication endpoints (Node.js port of Member 1's routes).
// Same request/response shapes as the Python backend.

import { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getUserIdFromToken,
  getUserProfile
} from '../auth.js';

export const auth = Router();

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

auth.post('/register', async (req, res) => {
  const { name, email, password, confirm_password: confirm } = req.body || {};
  const result = await registerUser(name, email, password, confirm);
  return res.status(result.success ? 201 : 400).json(result);
});

auth.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const result = await loginUser(email, password);
  return res.status(result.success ? 200 : 401).json(result);
});

auth.post('/logout', (req, res) => {
  return res.json(logoutUser(getBearerToken(req)));
});

auth.get('/me', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profile = await getUserProfile(userId);
  if (!profile) {
    return res.status(404).json({ error: 'User profile not found.' });
  }
  return res.json({ user: profile });
});
