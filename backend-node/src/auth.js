// auth.js - Authentication module for Vaultly (Node.js port of Member 1's auth.py).
// Password hashing with PBKDF2-HMAC-SHA256 (100,000 iterations) using Node's
// built-in crypto module — no bcrypt dependency needed.
// Session tokens are 256-bit cryptographically secure random values stored in
// an in-memory Map (same design as the Python backend, easy to explain in a viva).

import crypto from 'node:crypto';
import { prisma } from './prisma.js';

// In-memory session store: token (string) -> user_id (number)
export const sessions = new Map();

const SESSION_TOKEN_BYTES = 32;

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

  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  sessions.set(token, user.user_id);

  return {
    success: true,
    token,
    user: { user_id: user.user_id, name: user.name, email: user.email }
  };
}

export function logoutUser(token) {
  if (token && sessions.has(token)) {
    sessions.delete(token);
  }
  return { success: true, message: 'Logged out successfully.' };
}

export function getUserIdFromToken(token) {
  if (!token) {
    return null;
  }
  return sessions.get(token) ?? null;
}

export async function getUserProfile(userId) {
  const user = await prisma.users.findUnique({
    where: { user_id: userId },
    select: { user_id: true, name: true, email: true, created_at: true }
  });
  return user || null;
}
