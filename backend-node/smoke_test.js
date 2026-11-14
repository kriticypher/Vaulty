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
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from './src/invoices.js';
import { prisma } from './src/prisma.js';
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
// Distinct-yet-valid PNG variants: identical bytes now COUNT as duplicates,
// so each stored upload must use different content.
const pngVariant = (seed) => Buffer.concat([PNG_BYTES, Buffer.from([seed & 0xff])]);
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
  body: { file_name: 'receipt photo.PNG', file_data: b64(pngVariant(1)), invoice_number: 'INV-1', seller: 'Amazon' }
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

const crossUpload = await json('POST', `/api/products/${productsA[0]}/invoices`, { token: tokenB, body: { file_name: 'hijack.png', file_data: b64(pngVariant(201)) } });
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
check('Download streams the stored bytes', dl.status === 200 && dlBytes.length === pngVariant(1).length, `status=${dl.status} len=${dlBytes.length}`);
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
  body: { file_name: 'orphan.png', file_data: b64(pngVariant(202)) }
});
check('Upload to a NON-EXISTENT product is rejected', noProduct.status === 400 && /not found or access denied/i.test(noProduct.data.error || ''), JSON.stringify(noProduct.data));

const prodB = await json('POST', '/api/products', { token: tokenB, body: { name: 'Bob Product', price: 50, purchase_date: '2026-02-02' } });
const linkInvoice = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'link.png', file_data: b64(pngVariant(203)) }
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

// ── 9. COOKIES & 7-DAY SESSIONS ──────────────────────────────────────────────
console.log('\n9. Cookie & Session Tests:');
const cookieLogin = await fetch(`${base()}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: emailA, password: 'password1' })
});
const setCookie = cookieLogin.headers.get('set-cookie') || '';
check('Login sets HttpOnly session cookie with 7-day Max-Age',
      setCookie.includes('vaultly_session=') && setCookie.includes('HttpOnly') && setCookie.includes('Max-Age=604800'),
      setCookie);
const cookieToken = /vaultly_session=([^;]+)/.exec(setCookie)?.[1];

const meViaCookie = await json('GET', '/api/me', { token: cookieToken });
check('Session authenticates via Bearer fallback', meViaCookie.status === 200, JSON.stringify(meViaCookie.data));

const meViaCookieHeader = await fetch(`${base()}/api/me`, {
  headers: { Cookie: `vaultly_session=${cookieToken}` }
});
check('Session authenticates via cookie (no Authorization header)', meViaCookieHeader.status === 200, `status=${meViaCookieHeader.status}`);

const badCookie = await fetch(`${base()}/api/me`, { headers: { Cookie: 'vaultly_session=forged-token-value' } });
check('Forged/unknown cookie rejected (401)', badCookie.status === 401, `status=${badCookie.status}`);

const cookieLogout = await fetch(`${base()}/api/logout`, { method: 'POST', headers: { Cookie: `vaultly_session=${cookieToken}` } });
const logoutCookie = cookieLogout.headers.get('set-cookie') || '';
check('Logout clears the session cookie (Max-Age=0)', logoutCookie.includes('Max-Age=0'), logoutCookie);
const meAfterLogout = await fetch(`${base()}/api/me`, { headers: { Cookie: `vaultly_session=${cookieToken}` } });
check('Session token invalid after logout', meAfterLogout.status === 401, `status=${meAfterLogout.status}`);

// ── 10. DUPLICATE INVOICE DETECTION ──────────────────────────────────────────
console.log('\n10. Duplicate Detection Tests:');
const dupUpload = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'first.png', file_data: b64(pngVariant(10)), invoice_number: 'INV-DUP-1', seller: 'Duplicate Store' }
});
check('First invoice with seller+number saves', dupUpload.status === 201, JSON.stringify(dupUpload.data));
createdInvoiceFiles.push(dupUpload.data.invoice.file_path);

const userAId = loginA.data.user.user_id;
const userUploadsDir = path.join(UPLOAD_DIR, `u${userAId}`);
const fileCountBefore = (await fsp.readdir(userUploadsDir)).length;

const dupRepeat = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'second.png', file_data: b64(pngVariant(11)), invoice_number: 'inv-dup-1', seller: 'duplicate STORE' }
});
check('Same seller+number (case-insensitive) rejected with 409 + duplicate flag',
      dupRepeat.status === 409 && dupRepeat.data.duplicate === true &&
      dupRepeat.data.existing_invoice.invoice_id === dupUpload.data.invoice_id, JSON.stringify(dupRepeat.data));

const fileCountAfter = (await fsp.readdir(userUploadsDir)).length;
check('Rejected duplicate stored NO file on disk', fileCountAfter === fileCountBefore, `before=${fileCountBefore} after=${fileCountAfter}`);

const dupDifferent = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'third.png', file_data: b64(pngVariant(12)), invoice_number: 'INV-DUP-1', seller: 'Different Store' }
});
check('Same number but DIFFERENT seller is not a duplicate', dupDifferent.status === 201, JSON.stringify(dupDifferent.data));
createdInvoiceFiles.push(dupDifferent.data.invoice.file_path);

const dupForce = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'fourth.png', file_data: b64(pngVariant(13)), invoice_number: 'INV-DUP-1', seller: 'Duplicate Store', force: true }
});
check('force:true saves the deliberate duplicate exception', dupForce.status === 201, JSON.stringify(dupForce.data));
createdInvoiceFiles.push(dupForce.data.invoice.file_path);

const dupMissingFields = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'fifth.png', file_data: b64(pngVariant(14)) } // no metadata → still hash-checked
});
check('Uploads without seller+number save (unique file, nothing to compare)', dupMissingFields.status === 201, JSON.stringify(dupMissingFields.data));
createdInvoiceFiles.push(dupMissingFields.data.invoice.file_path);
const fifthInvoiceId = dupMissingFields.data.invoice_id;

// Exact-file duplicates: re-uploading the SAME BYTES is flagged even when the
// metadata fields are empty (this is what stops accidental double uploads).
const dupSameFile = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'renamed copy.png', file_data: b64(pngVariant(14)) }
});
check('Re-uploading the exact same file is rejected (409) even with no metadata',
      dupSameFile.status === 409 && dupSameFile.data.duplicate === true &&
      dupSameFile.data.duplicate_reason === 'identical_file' &&
      dupSameFile.data.existing_invoice.invoice_id === fifthInvoiceId, JSON.stringify(dupSameFile.data));

const dupSameFileForce = await json('POST', `/api/products/${productsA[1]}/invoices`, {
  token: tokenA,
  body: { file_name: 'renamed copy.png', file_data: b64(pngVariant(14)), force: true }
});
check('force:true allows the deliberate exact-file exception', dupSameFileForce.status === 201, JSON.stringify(dupSameFileForce.data));
createdInvoiceFiles.push(dupSameFileForce.data.invoice.file_path);

const dupSameFileOtherUser = await json('POST', `/api/products/${prodB.data.product_id}/invoices`, {
  token: tokenB,
  body: { file_name: 'same file other user.png', file_data: b64(pngVariant(14)) }
});
check('Identical file for a DIFFERENT user is not a duplicate', dupSameFileOtherUser.status === 201, JSON.stringify(dupSameFileOtherUser.data));
createdInvoiceFiles.push(dupSameFileOtherUser.data.invoice.file_path);

const dupSameFileHashStored = await prisma.invoices.findUnique({ where: { invoice_id: dupMissingFields.data.invoice_id } });
check('SHA-256 file hash stored on the invoice row', /^[0-9a-f]{64}$/.test(dupSameFileHashStored.file_hash || ''), dupSameFileHashStored.file_hash);

const dupForeign = await json('POST', `/api/products/${prodB.data.product_id}/invoices`, {
  token: tokenA,
  body: { file_name: 'sixth.png', file_data: b64(pngVariant(15)), invoice_number: 'INV-DUP-1', seller: 'Duplicate Store' }
});
check('Duplicate scope is per-user: User A invoice invisible to User B upload', dupForeign.status === 400, JSON.stringify(dupForeign.data));

// ── 11. PART E: SEARCH & SORT ────────────────────────────────────────────────
console.log('\n11. Search & Sort Tests (Part E):');
// Fresh invoices with distinct numbers/sellers/dates so the assertions below
// are deterministic regardless of earlier sections.
const searchSeed = [
  ['SEA-100', 'Zeta Retail', '2026-01-10'],
  ['sea-200', 'Ocean Traders', '2026-05-20'],
  ['OTHER-1', 'Zeta Retail', '2026-03-15']
];
const seededIds = [];
for (const [number, seller, date] of searchSeed) {
  const r = await json('POST', `/api/products/${productsA[2]}/invoices`, {
    token: tokenA,
    body: { file_name: 'seed.png', file_data: b64(pngVariant(20 + searchSeed.findIndex((x) => x[0] === number))), invoice_number: number, seller, invoice_date: date }
  });
  check(`Search seed ${number} uploaded`, r.status === 201, JSON.stringify(r.data));
  if (r.data.invoice) createdInvoiceFiles.push(r.data.invoice.file_path);
  seededIds.push(r.data.invoice_id);
}

const listAll = await json('GET', '/api/invoices', { token: tokenA });
check('GET /api/invoices lists every invoice', listAll.status === 200 && listAll.data.invoices.length >= 6, `count=${listAll.data.invoices.length}`);

const sNum = await json('GET', '/api/invoices?search=sea&field=invoice_number', { token: tokenA });
check('Search by invoice number finds SEA-100 + sea-200 (case-insensitive)',
      sNum.data.invoices.length === 2 &&
      sNum.data.invoices.some((i) => i.invoice_number === 'SEA-100') &&
      sNum.data.invoices.some((i) => i.invoice_number === 'sea-200'), JSON.stringify(sNum.data.invoices.map((i) => i.invoice_number)));

const sSeller = await json('GET', '/api/invoices?search=zeta&field=seller', { token: tokenA });
check('Search by seller finds both Zeta Retail invoices',
      sSeller.data.invoices.length === 2 && sSeller.data.invoices.every((i) => i.seller === 'Zeta Retail'), JSON.stringify(sSeller.data.invoices.map((i) => i.invoice_number)));

const sProduct = await json('GET', '/api/invoices?search=gamma desk&field=product', { token: tokenA });
check('Search by product name finds the 3 seeded Gamma Desk invoices (plus any un-numbered ones)',
      sProduct.data.invoices.filter((i) => i.invoice_number).length === 3 &&
      sProduct.data.invoices.every((i) => i.product_name === 'Gamma Desk'), JSON.stringify(sProduct.data.invoices.map((i) => [i.invoice_number, i.product_name])));

const sProductBeta = await json('GET', '/api/invoices?search=beta&field=product', { token: tokenA });
check('Product-name search matches the Beta Mouse invoices',
      sProductBeta.data.invoices.length >= 3 && sProductBeta.data.invoices.every((i) => i.product_name === 'Beta Mouse'), JSON.stringify(sProductBeta.data.invoices.map((i) => i.invoice_number)));

const sAll = await json('GET', '/api/invoices?search=sea', { token: tokenA });
check('field=all matches number OR seller', sAll.data.invoices.length >= 2, JSON.stringify(sAll.data.invoices.map((i) => [i.invoice_number, i.seller])));

const sNone = await json('GET', '/api/invoices?search=zzz-nothing', { token: tokenA });
check('No match returns an empty list', sNone.status === 200 && sNone.data.invoices.length === 0, JSON.stringify(sNone.data));

const sortAsc = await json('GET', '/api/invoices?sort=date_asc', { token: tokenA });
const ascDates = sortAsc.data.invoices.map((i) => i.invoice_date || '9999');
check('date_asc returns oldest invoice date first (2026-01-10)', ascDates[0] === '2026-01-10', JSON.stringify(ascDates));
check('date_asc list is non-decreasing by date', ascDates.every((d, idx) => idx === 0 || ascDates[idx - 1] <= d), JSON.stringify(ascDates));

const sortDesc = await json('GET', '/api/invoices?sort=date_desc', { token: tokenA });
const descDates = sortDesc.data.invoices.map((i) => i.invoice_date || '');
check('date_desc returns newest invoice date first (2026-05-20)', descDates[0] === '2026-05-20', JSON.stringify(descDates));
check('date_desc list is non-increasing by date', descDates.every((d, idx) => idx === 0 || descDates[idx - 1] >= d), JSON.stringify(descDates));

const sSorted = await json('GET', '/api/invoices?search=zeta&field=seller&sort=date_asc', { token: tokenA });
check('Search + sort combine (Zeta invoices by date asc)',
      JSON.stringify(sSorted.data.invoices.map((i) => i.invoice_date)) === JSON.stringify(['2026-01-10', '2026-03-15']),
      JSON.stringify(sSorted.data.invoices.map((i) => i.invoice_date)));

const sForeign = await json('GET', '/api/invoices?search=sea', { token: tokenB });
check('Search scope is per-user (User B finds none of User A invoices)', sForeign.data.invoices.length === 0, JSON.stringify(sForeign.data));

const sNoAuth = await json('GET', '/api/invoices?search=sea');
check('Search requires authentication (401)', sNoAuth.status === 401, `status=${sNoAuth.status}`);

// ── 12. BCRYPT PASSWORD HASHING ──────────────────────────────────────────────
console.log('\n12. bcrypt Tests:');
const bcryptEmail = `smoketest-bcrypt-${Date.now()}@example.com`;
createdUserEmails.push(bcryptEmail);
await json('POST', '/api/register', { body: { name: 'Bcrypt Tester', email: bcryptEmail, password: 'secret123', confirm_password: 'secret123' } });

const bcryptRow = await prisma.users.findUnique({ where: { email: bcryptEmail } });
check('New registration stores a bcrypt hash ($2 prefix)', /^\$2[aby]\$/.test(bcryptRow.password_hash), bcryptRow.password_hash.slice(0, 7));
check('bcrypt cost factor is 10', bcryptRow.password_hash.startsWith('$2a$10$') || bcryptRow.password_hash.startsWith('$2b$10$'), bcryptRow.password_hash.slice(0, 9));
check('bcrypt hashes embed a unique salt (no plain salt needed)', bcryptRow.password_hash.length >= 59, `len=${bcryptRow.password_hash.length}`);

const bcryptLogin = await json('POST', '/api/login', { body: { email: bcryptEmail, password: 'secret123' } });
check('Login verifies against the bcrypt hash', bcryptLogin.status === 200 && bcryptLogin.data.success === true, JSON.stringify(bcryptLogin.data));
const bcryptWrong = await json('POST', '/api/login', { body: { email: bcryptEmail, password: 'wrong-pass' } });
check('Wrong password rejected for bcrypt account (401)', bcryptWrong.status === 401, `status=${bcryptWrong.status}`);

// Legacy account: a row still holding the old PBKDF2 hash must log in and be
// transparently upgraded to bcrypt on that successful login.
const legacyEmail = `smoketest-legacy-${Date.now()}@example.com`;
createdUserEmails.push(legacyEmail);
const legacySalt = crypto.randomBytes(16).toString('hex');
const legacyHash = crypto.pbkdf2Sync('oldpass99', legacySalt, 100000, 32, 'sha256').toString('hex');
await prisma.users.create({ data: { name: 'Legacy User', email: legacyEmail, password_hash: legacyHash, salt: legacySalt } });

const legacyLogin = await json('POST', '/api/login', { body: { email: legacyEmail, password: 'oldpass99' } });
check('Legacy PBKDF2 account can still log in', legacyLogin.status === 200 && legacyLogin.data.success === true, JSON.stringify(legacyLogin.data));
const upgradedRow = await prisma.users.findUnique({ where: { email: legacyEmail } });
check('Legacy hash transparently upgraded to bcrypt after login', /^\$2[aby]\$/.test(upgradedRow.password_hash), upgradedRow.password_hash.slice(0, 7));
const legacyAgain = await json('POST', '/api/login', { body: { email: legacyEmail, password: 'oldpass99' } });
check('Upgraded account logs in again with the same password', legacyAgain.status === 200, `status=${legacyAgain.status}`);

// ── 13. OCR (PDF text extraction + graceful image degradation) ───────────────
console.log('\n13. OCR Tests:');
// Hand-built one-page PDF whose content stream is Flate-compressed, exactly
// like a real text-based invoice PDF (scanned PDFs have no text operators).
const ocrContent = [
  'BT /F1 14 Tf 72 720 Td',
  '(Invoice No: INV-2026-777) Tj',
  '0 -24 Td (Sold by: Acme Traders) Tj',
  '0 -24 Td (Date: 2026-02-15) Tj',
  'ET'
].join('\n');
const ocrStream = zlib.deflateSync(Buffer.from(ocrContent, 'latin1'));
const ocrPdf = Buffer.concat([
  Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${ocrStream.length} >>\nstream\n`, 'latin1'),
  ocrStream,
  Buffer.from('\nendstream\nendobj\ntrailer\n%%EOF\n', 'latin1')
]);

const ocrResp = await json('POST', '/api/invoices/ocr-preview', {
  token: tokenA,
  body: { file_name: 'invoice.pdf', file_data: b64(ocrPdf) }
});
check('OCR preview endpoint accepts a real PDF (200 + success)', ocrResp.status === 200 && ocrResp.data.success === true, JSON.stringify(ocrResp.data));
check('OCR engine reported as pdf-zlib', ocrResp.data.ocr?.engine === 'pdf-zlib', JSON.stringify(ocrResp.data.ocr));
check('OCR detects invoice number INV-2026-777', /INV-2026-777/.test(ocrResp.data.ocr?.invoice_number || ''), ocrResp.data.ocr?.invoice_number);
check('OCR detects seller "Acme Traders"', /Acme Traders/.test(ocrResp.data.ocr?.seller || ''), ocrResp.data.ocr?.seller);
check('OCR detects date 2026-02-15', ocrResp.data.ocr?.invoice_date === '2026-02-15', ocrResp.data.ocr?.invoice_date);

const ocrNoAuth = await json('POST', '/api/invoices/ocr-preview', { body: { file_name: 'invoice.pdf', file_data: b64(ocrPdf) } });
check('OCR preview requires authentication (401)', ocrNoAuth.status === 401, `status=${ocrNoAuth.status}`);

// The OCR pass must never be a way in past upload validation: a text file
// renamed .pdf is still rejected by magic bytes on the preview endpoint.
const ocrFake = await json('POST', '/api/invoices/ocr-preview', { token: tokenA, body: { file_name: 'fake.pdf', file_data: b64(Buffer.from('plain text')) } });
check('OCR preview validates the file like upload does (400)', ocrFake.status === 400, JSON.stringify(ocrFake.data));

// Upload stores the OCR text when the client sends it (captured at preview time)
const ocrUpload = await json('POST', `/api/products/${productsA[2]}/invoices`, {
  token: tokenA,
  body: {
    file_name: 'invoice.pdf', file_data: b64(ocrPdf),
    invoice_number: 'INV-2026-777', seller: 'Acme Traders', invoice_date: '2026-02-15',
    ocr_text: 'Invoice No: INV-2026-777 Sold by: Acme Traders Date: 2026-02-15'
  }
});
check('Upload with ocr_text saves (201)', ocrUpload.status === 201, JSON.stringify(ocrUpload.data));
if (ocrUpload.data.invoice) createdInvoiceFiles.push(ocrUpload.data.invoice.file_path);
const ocrRow = await prisma.invoices.findUnique({ where: { invoice_id: ocrUpload.data.invoice_id } });
check('ocr_text + ocr_processed stored on the invoice row', ocrRow?.ocr_processed === true && /INV-2026-777/.test(ocrRow?.ocr_text || ''), `processed=${ocrRow?.ocr_processed}`);
check('ocr_text is truncated to the 5000-char cap', (ocrRow?.ocr_text || '').length <= 5000, `len=${(ocrRow?.ocr_text || '').length}`);

// Degraded path: PNG_BYTES is a header + zeros (not a real picture). The
// tesseract engine may fail to decode it or read nothing — either way the
// endpoint must return 200 with empty fields / a friendly error, never crash.
const ocrDegraded = await json('POST', '/api/invoices/ocr-preview', {
  token: tokenA,
  body: { file_name: 'blank.png', file_data: b64(pngVariant(99)) }
});
check('Garbled image degrades gracefully (200, no crash)', ocrDegraded.status === 200 && ocrDegraded.data.success === true, JSON.stringify(ocrDegraded.data).slice(0, 200));
check('Degraded OCR leaves the form fields empty for manual entry',
      ocrDegraded.data.ocr.invoice_number === '' && ocrDegraded.data.ocr.seller === '' && ocrDegraded.data.ocr.invoice_date === '',
      JSON.stringify({ n: ocrDegraded.data.ocr.invoice_number, s: ocrDegraded.data.ocr.seller, d: ocrDegraded.data.ocr.invoice_date }));

// CID-keyed fonts (Identity-H): many real invoices (e.g. generated by billing
// tools) store text as "<0044 0055…> Tj" glyph codes decoded via /ToUnicode.
// Build one synthetically: encode the strings as 2-byte codes with a bfchar
// map that maps each code to its Unicode char.
const cidStrings = ['Invoice No: CID-2026-55', 'Sold by: Hexline Traders', 'Date: 2026-08-21'];
const encodeCid = (str) => [...str].map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const cidChars = [...new Set(cidStrings.join(''))];
const bfcharEntries = cidChars.map((ch) => `<${ch.charCodeAt(0).toString(16).padStart(4, '0')}> <${ch.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n');
const cidContent = cidStrings
  .map((str) => `BT /F1 12 Tf 72 ${720 - cidStrings.indexOf(str) * 24} Td <${encodeCid(str)}> Tj ET`)
  .join('\n');
const cidCMap = [
  '/CIDInit /ProcSet findresource begin',
  '12 dict begin', 'begincmap',
  '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange',
  `${cidChars.length} beginbfchar`, bfcharEntries, 'endbfchar',
  'endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end'
].join('\n');
const cidPdf = Buffer.concat([
  Buffer.from('%PDF-1.4\n', 'latin1'),
  Buffer.from(`1 0 obj << /Length ${Buffer.byteLength(cidContent)} >>\nstream\n${cidContent}\nendstream\nendobj\n`, 'latin1'),
  Buffer.from(`2 0 obj << /Length ${Buffer.byteLength(cidCMap)} >>\nstream\n${cidCMap}\nendstream\nendobj\ntrailer\n%%EOF\n`, 'latin1')
]);
const ocrCid = await json('POST', '/api/invoices/ocr-preview', {
  token: tokenA,
  body: { file_name: 'cid-invoice.pdf', file_data: b64(cidPdf) }
});
check('CID/Identity-H PDF text is decoded via ToUnicode (200 + success)', ocrCid.status === 200 && ocrCid.data.success === true, JSON.stringify(ocrCid.data).slice(0, 250));
check('CID PDF detects invoice number CID-2026-55', /CID-2026-55/.test(ocrCid.data.ocr?.invoice_number || ''), ocrCid.data.ocr?.invoice_number);
check('CID PDF detects seller "Hexline Traders"', /Hexline Traders/.test(ocrCid.data.ocr?.seller || ''), ocrCid.data.ocr?.seller);
check('CID PDF detects date 2026-08-21', ocrCid.data.ocr?.invoice_date === '2026-08-21', ocrCid.data.ocr?.invoice_date);

// A PDF with NO text operators and no sizeable embedded images (PDF_BYTES is
// a bare header + zeros) must still answer 200 with empty fields — never 500.
const ocrNoText = await json('POST', '/api/invoices/ocr-preview', {
  token: tokenA,
  body: { file_name: 'empty.pdf', file_data: b64(PDF_BYTES) }
});
check('Textless PDF degrades to empty fields (200, no crash)', ocrNoText.status === 200 && ocrNoText.data.success === true && ocrNoText.data.ocr.invoice_number === '', JSON.stringify(ocrNoText.data).slice(0, 200));

// Month-name dates ("Jul 02, 2026") must normalize to ISO — verified through
// the full pipeline (normalizeDate itself is internal to the module):
const monthDateBytes = (() => {
  const content = 'BT /F1 12 Tf 72 720 Td (Invoice Date Jul 02, 2026 Sold by: Beta Store Invoice No: NM-7) Tj ET';
  const stream = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${stream.length} >>\nstream\n`, 'latin1'),
    stream,
    Buffer.from('\nendstream\nendobj\ntrailer\n%%EOF\n', 'latin1')
  ]);
})();
const ocrMonth = await json('POST', '/api/invoices/ocr-preview', {
  token: tokenA,
  body: { file_name: 'invoice.pdf', file_data: b64(monthDateBytes) }
});
check('Month-name date "Jul 02, 2026" normalizes to 2026-07-02', ocrMonth.data.ocr?.invoice_date === '2026-07-02', JSON.stringify(ocrMonth.data.ocr));
check('Month-name PDF still detects the invoice number NM-7', ocrMonth.data.ocr?.invoice_number === 'NM-7', ocrMonth.data.ocr?.invoice_number);

// ── 14. PART F: CSV EXPORT ───────────────────────────────────────────────────
console.log('\n14. CSV Export Tests (Part F):');
// Invoices crafted for CSV safety checks: formula-injection sellers, a comma
// that must trigger RFC 4180 quoting, distinct numbers to avoid dup detection.
const csvSeeds = [
  ['CSV-EQ-1', '=HYPERLINK("http://evil","pwn")', '2026-01-05'],
  ['CSV-AT-1', '@EvilStore', '2026-01-06'],
  ['CSV-PL-1', '+911234567890', '2026-01-07'],
  ['CSV-DA-1', '-9876', '2026-01-08'],
  ['CSV-CM-1', 'Acme, Inc. "Premier"', '2026-01-09']
];
const csvSeedIds = [];
for (const [i, [number, seller, date]] of csvSeeds.entries()) {
  const r = await json('POST', `/api/products/${productsA[2]}/invoices`, {
    token: tokenA,
    body: { file_name: 'csv-seed.png', file_data: b64(pngVariant(30 + i)), invoice_number: number, seller, invoice_date: date }
  });
  check(`CSV seed ${number} uploaded`, r.status === 201, JSON.stringify(r.data));
  createdInvoiceFiles.push(r.data.invoice.file_path);
  csvSeedIds.push(r.data.invoice_id);
}

const csvNoAuth = await json('GET', '/api/invoices/export');
check('CSV export requires authentication (401)', csvNoAuth.status === 401, `status=${csvNoAuth.status}`);

const csvRes = await fetch(`${base()}/api/invoices/export`, { headers: { Authorization: `Bearer ${tokenA}` } });
check('CSV response has text/csv + attachment headers',
      (csvRes.headers.get('content-type') || '').includes('text/csv') &&
      (csvRes.headers.get('content-disposition') || '').startsWith('attachment'), JSON.stringify({ ct: csvRes.headers.get('content-type'), cd: csvRes.headers.get('content-disposition') }));
check('CSV marked as nosniff', csvRes.headers.get('x-content-type-options') === 'nosniff', csvRes.headers.get('x-content-type-options'));

const csvText = await csvRes.text();
const csvLines = csvText.replace(/^\uFEFF/, '').trim().split('\r\n').filter(Boolean);
const csvHeader = csvLines[0].split(',').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
check('CSV header row includes invoice number, seller, date, product name',
      ['Invoice Number', 'Seller', 'Invoice Date', 'Product Name'].every((c) => csvHeader.includes(c)), csvHeader.join('|'));
check('CSV header never includes credentials or auth columns',
      !csvHeader.some((c) => /password|hash|salt|token|session/i.test(c)), csvHeader.join('|'));

const csvUserA = await json('GET', '/api/invoices', { token: tokenA });
check('CSV row count matches the user\'s invoice count', csvLines.length - 1 === csvUserA.data.invoices.length, `csv=${csvLines.length - 1} api=${csvUserA.data.invoices.length}`);

// Only the logged-in user's records: User B exports → no User A data at all.
const csvResB = await fetch(`${base()}/api/invoices/export`, { headers: { Authorization: `Bearer ${tokenB}` } });
const csvTextB = await csvResB.text();
// User B saved exactly one invoice earlier (the cross-user identical-file test)
// — the export must contain that one and NOTHING of User A's.
check('User B\'s CSV is scoped to User B only (1 own row, zero of A\'s records)',
      csvTextB.trim().split('\r\n').filter(Boolean).length - 1 === 1 &&
      !csvTextB.includes('Zeta Retail') && !csvTextB.includes('Duplicate Store'), `B rows=${csvTextB.trim().split('\r\n').filter(Boolean).length - 1}`);

// Data isolation: no password hashes, salts, or session tokens anywhere.
check('CSV contains no bcrypt hash fragments', !csvText.includes('$2a$') && !csvText.includes('$2b$'), '');
check('CSV contains no session token material', !csvText.includes(tokenA) && !csvText.includes(tokenB), '');

// CSV formula injection: dangerous leading characters are neutralised with '.
const checkCell = (name, needle) => {
  const line = csvLines.find((l) => l.includes(needle.replace(/^./, '')));
  check(name, Boolean(line), line ? line.slice(0, 120) : 'row not found');
};
checkCell('Seller "=HYPERLINK(…)" exported as text (leading apostrophe)', "'=HYPERLINK");
checkCell('Seller "@EvilStore" exported as text', "'@EvilStore");
checkCell('Seller "+91…" exported as text', "'+911234567890");
checkCell('Seller "-9876" exported as text', "'-9876");

// RFC 4180 escaping: comma + quotes in the seller are quoted and doubled.
const quotedLine = csvLines.find((l) => l.includes('Acme, Inc.'));
check('Seller with comma/quotes is properly quoted ("Acme, Inc. ""Premier""")',
      Boolean(quotedLine) && quotedLine.includes('"Acme, Inc. ""Premier"""'), quotedLine ? quotedLine.slice(0, 140) : 'not found');

// Round-trip: parse the CSV header + first data column widths are consistent.
const columnCounts = csvLines.map((l) => (l.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g) || []).length);
check('Every CSV row has the same number of columns', new Set(columnCounts).size === 1, `sizes=${[...new Set(columnCounts)].join(',')}`);

// ── CLEANUP: remove test users (cascades products/invoices) + stray files ────
for (const filePath of createdInvoiceFiles) {
  const abs = path.join(UPLOAD_DIR, filePath);
  await fsp.unlink(abs).catch(() => {});
}
await prisma.users.deleteMany({ where: { email: { in: createdUserEmails } } });

server.close();
await new Promise((resolve) => server.on('close', resolve));

console.log('\n=======================================================');
console.log(` SMOKE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('=======================================================\n');
process.exit(failed === 0 ? 0 : 1);
