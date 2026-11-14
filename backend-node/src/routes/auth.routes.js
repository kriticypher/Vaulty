// auth.routes.js - Authentication endpoints (Node.js port of Member 1's routes).
// Same request/response shapes as the Python backend, plus HttpOnly cookie
// sessions with a 7-day lifetime (set on login, cleared on logout).

import { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getUserIdFromRequest,
  getUserProfile,
  SESSION_MAX_AGE_SECONDS
} from '../auth.js';
import { sessionCookie, clearedSessionCookie, getCookie } from '../cookies.js';

export const auth = Router();

auth.post('/register', async (req, res) => {
  const { name, email, password, confirm_password: confirm } = req.body || {};
  const result = await registerUser(name, email, password, confirm);
  return res.status(result.success ? 201 : 400).json(result);
});

auth.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const result = await loginUser(email, password);
  if (result.success) {
    // Persist the session in an HttpOnly cookie so the browser stays logged in
    // for 7 days and across server restarts (the token also lives in the DB).
    res.setHeader('Set-Cookie', sessionCookie(result.token, SESSION_MAX_AGE_SECONDS));
  }
  return res.status(result.success ? 200 : 401).json(result);
});

auth.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : getCookie(req, 'vaultly_session');
  const result = await logoutUser(token);
  res.setHeader('Set-Cookie', clearedSessionCookie());
  return res.json(result);
});

auth.get('/me', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  const profile = await getUserProfile(userId);
  if (!profile) {
    return res.status(404).json({ error: 'User profile not found.' });
  }
  return res.json({ user: profile });
});
