// auth.js - Authentication module for Vaultly (Node.js).
// Password hashing with PBKDF2-HMAC-SHA256 (100,000 iterations) using Node's
// built-in crypto module — no bcrypt dependency needed.
//
// SESSIONS: tokens are stored in the Sessions table with a 7-day expiry and
// delivered to the browser in an HttpOnly cookie. Because they live in the
// DATABASE (not in server memory), they survive server restarts — the user
// stays logged in until the cookie expires or they log out.

import crypto from 'node:crypto';
import { prisma } from './prisma.js';

const SESSION_TOKEN_BYTES = 32;
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function hashPassword(password, salt) {
  // PBKDF2 is intentionally slow to resist brute-force and rainbow-table attacks.
  // A unique per-user salt makes identical passwords hash differently.
  return crypto.pbkdf2Sync(String(password), salt, 100_000, 32, 'sha256').toString('hex');
}

export function registerUser(name, email, password, confirmPassword = null) {
  return new Promise((resolve) => {
    void (async () => {
      name = (name || '').trim();
      email = (email || '').trim().toLowerCase();

      if (!name || !email || !password) {
        return resolve({ success: false, error: 'All fields are required.' });
      }
      if (!email.includes('@') || !email.includes('.')) {
        return resolve({ success: false, error: 'Please provide a valid email address.' });
      }
      if (String(password).length < 6) {
        return resolve({ success: false, error: 'Password must be at least 6 characters long.' });
      }
      if (confirmPassword !== null && password !== confirmPassword) {
        return resolve({ success: false, error: 'Passwords do not match.' });
      }

      const salt = crypto.randomBytes(16).toString('hex'); // 16-byte random salt
      const passwordHash = hashPassword(password, salt);

      try {
        const created = await prisma.users.create({
          data: { name, email, password_hash: passwordHash, salt }
        });
        resolve({
          success: true,
          message: 'User registered successfully.',
          user_id: created.user_id
        });
      } catch (err) {
        if (err && err.code === 'P2002') {
          // Prisma unique-constraint violation on email
          return resolve({ success: false, error: 'Email is already registered. Please login instead.' });
        }
        resolve({ success: false, error: 'Database error during registration.' });
      }
    })();
  });
}

export async function loginUser(email, password) {
  email = (email || '').trim().toLowerCase();
  if (!email || !password) {
    return { success: false, error: 'Email and password are required.' };
  }

  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) {
    return { success: false, error: 'Invalid email or password.' };
  }

  const computedHash = hashPassword(password, user.salt);
  // timingSafeEqual prevents timing attacks on the comparison
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(user.password_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { success: false, error: 'Invalid email or password.' };
  }

  // Housekeeping: purge this user's expired sessions
  await prisma.sessions.deleteMany({ where: { user_id: user.user_id, expires_at: { lte: new Date() } } });

  // Create a persistent 7-day session (stored in the database)
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.sessions.create({ data: { token, user_id: user.user_id, expires_at: expiresAt } });

  return {
    success: true,
    token, // still returned for non-browser clients; browsers use the cookie
    user: { user_id: user.user_id, name: user.name, email: user.email }
  };
}

export async function logoutUser(token) {
  if (token) {
    await prisma.sessions.deleteMany({ where: { token } });
  }
  return { success: true, message: 'Logged out successfully.' };
}

/**
 * Resolves the authenticated user_id from a request.
 * Priority: Authorization: Bearer header (API/mobile clients) →
 * vaultly_session cookie (browser). Expired sessions are deleted.
 */
export async function getUserIdFromRequest(req) {
  let token = '';
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    token = header.slice(7).trim();
  } else {
    // tiny inline cookie scan to avoid a parser dependency
    for (const part of (req.headers.cookie || '').split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === 'vaultly_session') {
        token = decodeURIComponent(rest.join('='));
        break;
      }
    }
  }
  if (!token) {
    return null;
  }

  const session = await prisma.sessions.findUnique({
    where: { token },
    select: { user_id: true, expires_at: true }
  });
  if (!session) {
    return null;
  }
  if (session.expires_at.getTime() <= Date.now()) {
    await prisma.sessions.deleteMany({ where: { token } });
    return null;
  }
  return session.user_id;
}

// Backwards-compatible alias for code that already has a token string
export async function getUserIdFromToken(token) {
  if (!token) {
    return null;
  }
  const session = await prisma.sessions.findUnique({
    where: { token },
    select: { user_id: true, expires_at: true }
  });
  if (!session || session.expires_at.getTime() <= Date.now()) {
    return null;
  }
  return session.user_id;
}

export async function getUserProfile(userId) {
  const user = await prisma.users.findUnique({
    where: { user_id: userId },
    select: { user_id: true, name: true, email: true, created_at: true }
  });
  return user || null;
}
