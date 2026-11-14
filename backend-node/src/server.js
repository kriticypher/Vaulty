// server.js - Vaultly backend (Node.js + Express + Prisma + SQLite).
// Port of Member 1's Python server plus Member 2's invoice module.
// Same endpoints, same JSON response shapes, same security behavior —
// the existing React frontend and the future Android WebView app work unchanged.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { UPLOAD_DIR } from './invoices.js';
import { auth } from './routes/auth.routes.js';
import { products } from './routes/products.routes.js';
import { dashboard } from './routes/dashboard.routes.js';
import { invoices } from './routes/invoices.routes.js';

const PORT = 8000;

const app = express();

// 7 MB request-body cap: a 5 MB file is ~6.99 MB in Base64 (+ JSON overhead).
// Oversized bodies are rejected BEFORE parsing (see error middleware below).
app.use(express.json({ limit: '7mb' }));

// ── CORS for local development with React/Vite (no extra dependency) ─────────
// Allow-list of development origins. Beyond the normal browser at
// localhost:5173, the Android emulator loads the page from 10.0.2.2:5173
// (the emulator's alias for the host machine's loopback).
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://10.0.2.2:5173'
]);
const CORS_DEFAULTS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};
app.use((req, res, next) => {
  for (const [header, value] of Object.entries(CORS_DEFAULTS)) {
    res.setHeader(header, value);
  }
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Request logging for academic demonstration (same style as the Python server)
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api', auth);
app.use('/api', products);
app.use('/api', dashboard);
app.use('/api', invoices);

// ── ERROR HANDLING ────────────────────────────────────────────────────────────

// express.json() rejects oversized bodies with entity.too.large — translate
// that into the same friendly message the Python backend returned (413).
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Upload is too large. Maximum file size is 5 MB.' });
  }
  if (err) {
    console.error('Unhandled error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
  next();
});

// 404 for unknown endpoints (same response shape as the Python backend)
app.use((req, res) => {
  res.status(404).json({ error: `Endpoint not found: ${req.originalUrl.split('?')[0].replace(/\/$/, '')}` });
});

// Ensure the uploads directory exists before the server starts
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Only start listening when this file is executed directly (`npm start`),
// so smoke_test.js can import the app and bind its own ephemeral port.
const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  app.listen(PORT, () => {
    console.log('\n=======================================================');
    console.log(` Vaultly Backend Server (Node.js + Prisma) running on http://localhost:${PORT}`);
    console.log(' Ready to accept requests from the React frontend.');
    console.log('=======================================================\n');
  }).on('error', (err) => {
    // The most common cause of "the server just stops": an older copy of the
    // backend is still running and holding port 8000. Explain it clearly.
    if (err.code === 'EADDRINUSE') {
      console.error(`
=======================================================
 ERROR: Port ${PORT} is already in use.
 Another Vaultly backend (or another program) is still
 running on this port.

 Fix:
   • Close the other terminal running the server, or
   • kill the process holding the port:
       kill $(lsof -ti :${PORT})
 then start the server again.
=======================================================\n`);
      process.exit(1);
    }
    throw err;
  });
}

export { app };
