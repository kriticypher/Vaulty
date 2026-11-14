// smoke_test.js - End-to-end test suite for the Node.js + Prisma backend.
// Port of backend/test_invoices.py's coverage plus the Member 1 endpoints.
// Run with: npm test   (from backend-node/)
//
// NOTE: unlike the Python suite (which used a temp database), this runs
// against the shared dev database/vaultly.db, creates users with unique
// "smoketest-" emails, and deletes them (with all their data) at the end.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_DIR } from './src/invoices.js';
import { app } from './src/server.js';

let passed = 0;
let failed = 0;
const createdUserEmails = [];
const createdInvoiceFiles = [];

function check(name, condition, details = '') {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed += 1;
  } else {
    console.log(`  [FAIL] ${name} - ${details}`);
    failed += 1;
  }
}

const base = () => `http://127.0.0.1:${server.address().port}`;

const server = app.listen(0); // ephemeral port, no clashes with a dev server

async function json(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base()}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON (file stream) */ }
  return { status: res.status, data, headers: res.headers };
}

const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(80)]);
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n', 'latin1'), Buffer.alloc(80)]);
const b64 = (buf) => buf.toString('base64');

await new Promise((resolve) => server.on('listening', resolve));

console.log('\n=======================================================');
console.log(' RUNNING VAULTLY NODE BACKEND SMOKE TEST');
console.log('=======================================================\n');

// ── 1. AUTHENTICATION ────────────────────────────────────────────────────────
console.log('1. Authentication Tests:');
const emailA = `smoketest-alice-${Date.now()}@example.com`;
const emailB = `smoketest-bob-${Date.now()}@example.com`;
createdUserEmails.push(emailA, emailB);

const regA = await json('POST', '/api/register', { body: { name: 'Alice', email: emailA, password: 'password1', confirm_password: 'password1' } });
check('Valid registration (201)', regA.status === 201 && regA.data.success === true, JSON.stringify(regA.data));

const dupA = await json('POST', '/api/register', { body: { name: 'Clone', email: emailA, password: 'password2' } });
check('Duplicate email rejected', dupA.status === 400 && /already registered/i.test(dupA.data.error || ''), JSON.stringify(dupA.data));

const badLogin = await json('POST', '/api/login', { body: { email: emailA, password: 'wrong-password' } });
check('Wrong password rejected (401)', badLogin.status === 401, JSON.stringify(badLogin.data));

const loginA = await json('POST', '/api/login', { body: { email: emailA, password: 'password1' } });
check('Login returns 64-char token', loginA.status === 200 && (loginA.data.token || '').length === 64, JSON.stringify(loginA.data));
const tokenA = loginA.data.token;

const me = await json('GET', '/api/me', { token: tokenA });
check('GET /api/me returns profile', me.status === 200 && me.data.user.email === emailA, JSON.stringify(me.data));

const noAuth = await json('GET', '/api/products');
check('Protected endpoint rejects missing token (401)', noAuth.status === 401, JSON.stringify(noAuth.data));

await json('POST', '/api/register', { body: { name: 'Bob', email: emailB, password: 'password2' } });
const loginB = await json('POST', '/api/login', { body: { email: emailB, password: 'password2' } });
const tokenB = loginB.data.token;

// ── 2. PRODUCTS + DSA ────────────────────────────────────────────────────────
console.log('\n2. Product & DSA Tests:');
const productsA = [];
for (const [name, price, category] of [['Alpha Camera', 5000, 'Electronics'], ['Beta Mouse', 700, 'Electronics'], ['Gamma Desk', 12000, 'Furniture']]) {
  const r = await json('POST', '/api/products', { token: tokenA, body: { name, price, category, purchase_date: '2026-01-15' } });
  productsA.push(r.data.product_id);
}
check('Three products created', productsA.every(Boolean), JSON.stringify(productsA));

const sortedDesc = await json('GET', '/api/products?sort_by=price_desc', { token: tokenA });
const prices = sortedDesc.data.products.map((p) => p.price);
check('Merge Sort price_desc correct (12000, 5000, 700)', JSON.stringify(prices) === JSON.stringify([12000, 5000, 700]), JSON.stringify(prices));

const search = await json('GET', '/api/products?search=alpha', { token: tokenA });
check('Linear Search finds "Alpha Camera" only', search.data.products.length === 1 && search.data.products[0].name === 'Alpha Camera', JSON.stringify(search.data.products.map((p) => p.name)));

const crossList = await json('GET', '/api/products', { token: tokenB });
check('User B sees zero of User A products', crossList.data.products.length === 0, JSON.stringify(crossList.data));

const foreignGet = await json('GET', `/api/products/${productsA[0]}`, { token: tokenB });
check('User B cannot open User A product (404)', foreignGet.status === 404, JSON.stringify(foreignGet.data));

const details = await json('GET', `/api/products/${productsA[0]}`, { token: tokenA });
check('Product details include linked record arrays', ['product', 'invoices', 'warranties', 'returns', 'services'].every((k) => Array.isArray(details.data[k]) || !!details.data[k]), JSON.stringify(Object.keys(details.data)));

// ── 3. INVOICE UPLOAD SECURITY ───────────────────────────────────────────────
console.log('\n3. Invoice Upload Tests:');
const up = await json('POST', `/api/products/${productsA[0]}/invoices`, {
  token: tokenA,
  body: { file_name: 'receipt photo.PNG', file_data: b64(PNG_BYTES), invoice_number: 'INV-1', seller: 'Amazon' }
});
check('Valid PNG upload (201)', up.status === 201 && up.data.success === true, JSON.stringify(up.data));
const invoiceId = up.data.invoice_id;
check('Original filename + verified mime stored', up.data.invoice.original_filename === 'receipt photo.PNG' && up.data.invoice.mime_type === 'image/png', JSON.stringify(up.data.invoice));
createdInvoiceFiles.push(up.data.invoice.file_path);

const badExt = await json('POST', `/api/products/${productsA[0]}/invoices`, { token: tokenA, body: { file_name: 'notes.txt', file_data: b64(Buffer.from('text')) } });
check('.txt rejected', badExt.status === 400 && /unsupported file type/i.test(badExt.data.error || ''), JSON.stringify(badExt.data));

const fakePdf = await json('POST', `/api/products/${productsA[0]}/invoices`, { token: tokenA, body: { file_name: 'fake.pdf', file_data: b64(Buffer.from('definitely not a pdf')) } });
check('Text renamed .pdf rejected by magic bytes', fakePdf.status === 400 && /content does not match/i.test(fakePdf.data.error || ''), JSON.stringify(fakePdf.data));

const corrupt = await json('POST', `/api/products/${productsA[0]}/invoices`, { token: tokenA, body: { file_name: 'corrupt.png', file_data: '!!!not-base64!!!' } });
check('Corrupted Base64 rejected', corrupt.status === 400, JSON.stringify(corrupt.data));

const oversizeBody = JSON.stringify({ file_name: 'big.png', file_data: b64(Buffer.concat([PNG_BYTES, Buffer.alloc(9 * 1024 * 1024)])) });
const oversize = await json('POST', `/api/products/${productsA[0]}/invoices`, { token: tokenA, body: oversizeBody });
check('Oversized upload rejected with 413 + friendly message', oversize.status === 413 && /too large/i.test(oversize.data.error || ''), `${oversize.status} ${JSON.stringify(oversize.data)}`);

const traversal = await json('POST', `/api/products/${productsA[0]}/invoices`, { token: tokenA, body: { file_name: '../../database/vaultly.db', file_data: b64(PDF_BYTES) } });
check('Path traversal name rejected (.db not whitelisted)', traversal.status === 400, JSON.stringify(traversal.data));

const crossUpload = await json('POST', `/api/products/${productsA[0]}/invoices`, { token: tokenB, body: { file_name: 'hijack.png', file_data: b64(PNG_BYTES) } });
check('User B cannot upload to User A product', crossUpload.status === 400, JSON.stringify(crossUpload.data));

// ── 4. INVOICE DETAILS / EDIT (Part B) ───────────────────────────────────────
console.log('\n4. Invoice Details & Edit Tests:');
const one = await json('GET', `/api/invoices/${invoiceId}`, { token: tokenA });
check('Open invoice details', one.status === 200 && one.data.invoice.invoice_id === invoiceId, JSON.stringify(one.data));

const edit = await json('PUT', `/api/invoices/${invoiceId}`, { token: tokenA, body: { invoice_number: 'INV-E9', seller: 'Croma', invoice_date: '2026-03-01' } });
check('Edit updates metadata', edit.status === 200 && edit.data.invoice.invoice_number === 'INV-E9' && edit.data.invoice.invoice_date === '2026-03-01', JSON.stringify(edit.data));

const badDate = await json('PUT', `/api/invoices/${invoiceId}`, { token: tokenA, body: { invoice_date: 'March 3' } });
check('Invalid date rejected on edit', badDate.status === 400, JSON.stringify(badDate.data));

const fpAttack = await json('PUT', `/api/invoices/${invoiceId}`, { token: tokenA, body: { file_path: '../database/vaultly.db' } });
check('file_path immutable via edit endpoint', fpAttack.status === 200 && fpAttack.data.invoice.file_path === up.data.invoice.file_path, JSON.stringify(fpAttack.data));

const foreignEdit = await json('PUT', `/api/invoices/${invoiceId}`, { token: tokenB, body: { seller: 'Hacker' } });
check('Foreign user cannot edit invoice', foreignEdit.status === 400, JSON.stringify(foreignEdit.data));

const crossRead = await json('GET', `/api/invoices/${invoiceId}`, { token: tokenB });
check('Foreign user cannot open invoice details', crossRead.status === 404, JSON.stringify(crossRead.data));

// ── 5. DOWNLOAD ──────────────────────────────────────────────────────────────
console.log('\n5. Download Tests:');
const dl = await fetch(`${base()}/api/invoices/${invoiceId}/download`, { headers: { Authorization: `Bearer ${tokenA}` } });
const dlBytes = Buffer.from(await dl.arrayBuffer());
check('Download streams the stored bytes', dl.status === 200 && dlBytes.length === PNG_BYTES.length, `status=${dl.status} len=${dlBytes.length}`);
check('Security headers present (nosniff + attachment)', dl.headers.get('x-content-type-options') === 'nosniff' && (dl.headers.get('content-disposition') || '').startsWith('attachment'), JSON.stringify(dl.headers.get('content-disposition')));

const foreignDl = await fetch(`${base()}/api/invoices/${invoiceId}/download`, { headers: { Authorization: `Bearer ${tokenB}` } });
check('Foreign user cannot download', foreignDl.status === 404, `status=${foreignDl.status}`);

// ── 6. DASHBOARD / ANALYTICS ─────────────────────────────────────────────────
console.log('\n6. Dashboard & Analytics Tests:');
const dash = await json('GET', '/api/dashboard', { token: tokenA });
check('Dashboard stats correct', dash.status === 200 && dash.data.total_products === 3 && dash.data.total_spending === 17700 && dash.data.avg_price === 5900, JSON.stringify({ tp: dash.data.total_products, ts: dash.data.total_spending, avg: dash.data.avg_price }));

const analytics = await json('GET', '/api/analytics', { token: tokenA });
check('Analytics returns the documented keys', analytics.status === 200 && ['total_spending', 'total_products', 'avg_price', 'most_expensive', 'category_spending', 'monthly_spending'].every((k) => k in analytics.data), JSON.stringify(Object.keys(analytics.data)));

// ── 7. DELETE INVOICE + PRODUCT ──────────────────────────────────────────────
console.log('\n7. Deletion Tests:');
const fileOnDiskBefore = path.join(UPLOAD_DIR, up.data.invoice.file_path);
check('Stored file exists on disk before delete', fs.existsSync(fileOnDiskBefore), fileOnDiskBefore);

const del = await json('DELETE', `/api/invoices/${invoiceId}`, { token: tokenA });
check('Owner deletes invoice', del.status === 200 && del.data.success === true, JSON.stringify(del.data));
check('Stored file removed from disk on delete', !fs.existsSync(fileOnDiskBefore));

const gone = await json('GET', `/api/invoices/${invoiceId}`, { token: tokenA });
check('Deleted invoice returns 404', gone.status === 404, JSON.stringify(gone.data));

const delProduct = await json('DELETE', `/api/products/${productsA[0]}`, { token: tokenA });
check('Owner deletes product', delProduct.status === 200, JSON.stringify(delProduct.data));

// ── 8. PRODUCT LINKING (Part C) ──────────────────────────────────────────────
console.log('\n8. Product Linking Tests:');
const noProduct = await json('POST', '/api/products/999999/invoices', {
  token: tokenA,
  body: { file_name: 'orphan.png', file_data: b64(PNG_BYTES) }
});
check('Upload to a NON-EXISTENT product is rejected', noProduct.status === 400 && /not found or access denied/i.test(noProduct.data.error || ''), JSON.stringify(noProduct.data));

const prodB = await json('POST', '/api/products', { token: tokenB, body: { name: 'Bob Product', price: 50, purchase_date: '2026-02-02' } });
const linkInvoice = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'link.png', file_data: b64(PNG_BYTES) }
});
check('Invoice created linked to own product', linkInvoice.status === 201 && linkInvoice.data.invoice.product_id === productsA[1], JSON.stringify(linkInvoice.data));
createdInvoiceFiles.push(linkInvoice.data.invoice.file_path);

const relinkForeign = await json('PUT', `/api/invoices/${linkInvoice.data.invoice_id}`, {
  token: tokenA,
  body: { product_id: prodB.data.product_id } // product owned by User B
});
check('Re-linking to ANOTHER USER product is rejected', relinkForeign.status === 400 && /not found or access denied/i.test(relinkForeign.data.error || ''), JSON.stringify(relinkForeign.data));

const relinkOwn = await json('PUT', `/api/invoices/${linkInvoice.data.invoice_id}`, {
  token: tokenA,
  body: { product_id: productsA[2] } // another product owned by User A
});
check('Re-linking to own product succeeds', relinkOwn.status === 200 && relinkOwn.data.invoice.product_id === productsA[2], JSON.stringify(relinkOwn.data));

// ── CLEANUP: remove test users (cascades products/invoices) + stray files ────
for (const filePath of createdInvoiceFiles) {
  const abs = path.join(UPLOAD_DIR, filePath);
  await fsp.unlink(abs).catch(() => {});
}
const { prisma } = await import('./src/prisma.js');
await prisma.users.deleteMany({ where: { email: { in: createdUserEmails } } });

server.close();
await new Promise((resolve) => server.on('close', resolve));

console.log('\n=======================================================');
console.log(` SMOKE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('=======================================================\n');
process.exit(failed === 0 ? 0 : 1);
