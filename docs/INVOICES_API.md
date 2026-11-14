# Vaultly Invoice Module Documentation (Member 2 - Invoices & Documents)

**Module Owner:** Member 2
**Depends on:** Member 1's authentication, shared SQLite database and product table

> **Backend note:** This module was originally written for the Python stdlib backend and is
> now fully ported to the Node.js + Prisma backend (`backend-node/`). Both implementations
> expose identical endpoints and JSON shapes; the Python version in `backend/` is kept only
> as a reference until the team confirms removal. The test suite for the Node backend lives
> at `backend-node/smoke_test.js` (`npm test`, 36 checks).

---

## 1. What This Module Adds

| Feature | Where |
|---|---|
| Upload PDF / JPG / JPEG / PNG invoices (max 5 MB) | `POST /api/products/{id}/invoices` |
| Browse all of the user's saved invoices | `GET /api/invoices` |
| List invoices of one product | `GET /api/products/{id}/invoices` |
| **Open one invoice's full details** | `GET /api/invoices/{id}` |
| **Edit invoice information** | `PUT /api/invoices/{id}` |
| Download / preview a stored invoice | `GET /api/invoices/{id}/download` |
| Delete an invoice (record + stored file) | `DELETE /api/invoices/{id}` |

Frontend pieces:
- `frontend/src/pages/Invoices.jsx` — central Invoices page (replaces Member 1's placeholder route)
- `frontend/src/pages/InvoiceDetails.jsx` — "open details" page at `/invoices/:id` with view + edit + preview/download/delete
- `frontend/src/components/InvoiceUploader.jsx` — reusable upload widget
- `frontend/src/components/InvoiceList.jsx` — reusable list; clicking a file name opens its details page
- `frontend/src/services/invoiceService.js` — API calls + client-side validation
- Product details page now shows an "Invoices & Receipts" section instead of the placeholder card

---

## 2. Invoice Fields

Every invoice record contains exactly the fields from the module spec, plus
Member 1's schema columns:

| Field | Editable? | Notes |
|---|---|---|
| `invoice_id` | never | auto-increment primary key |
| `product_id` | via edit | must be a product **owned by the same user** |
| `invoice_number` | via edit | free text, optional |
| `seller` | via edit | free text, optional |
| `invoice_date` | via edit | `YYYY-MM-DD` format, validated |
| `file_path` | never | system-owned; only an upload/delete can change the stored file |

`original_filename`, `file_size`, `mime_type` and `uploaded_at` are system-managed
bookkeeping columns added by `ensure_invoice_schema()`.

### `PUT /api/invoices/{id}` — Edit example

```json
{ "invoice_number": "INV-2026-001", "seller": "Croma", "invoice_date": "2026-03-01", "product_id": 7 }
```

- Omitted fields keep their current values; `file_path` is ignored by design, so a
  malicious client can never re-point an invoice at another user's stored file.
- Re-linking validates ownership of the **target** product (`403`-style error otherwise).

---

## 2. Upload Transfer Format (Base64 JSON)

`POST /api/products/{id}/invoices` accepts a documented JSON envelope. The frontend reads the
file with `FileReader.readAsDataURL()` and sends only the Base64 payload:

```http
POST /api/products/3/invoices
Authorization: Bearer <token>      (or the vaultly_session cookie)
Content-Type: application/json
```

```json
{
  "file_name": "receipt.pdf",
  "file_data": "JVBERi0xLjQK...",
  "invoice_number": "INV-2026-001",
  "seller": "Amazon",
  "invoice_date": "2026-02-15",
  "force": false
}
```

Notes:
- `file_name` and `file_data` are required; the three metadata fields are optional.
- `file_data` is plain Base64 (no `data:` prefix, no newlines).
- **Size is enforced BEFORE decoding**: the encoded string may not exceed
  `ceil(5 MB / 3) * 4 ≈ 6.99 MB` characters, and the whole request body is capped
  at 7 MB (`Content-Length > 7 MB` returns `413` before the body is even read).
- `force: true` is the deliberate "save anyway" exception for duplicate detection (§7).

Success (`201 Created`):
```json
{
  "success": true,
  "message": "Invoice uploaded successfully.",
  "invoice_id": 5,
  "invoice": { "...": "full invoice record" }
}
```

Validation failures (`400 Bad Request`), all with a beginner-friendly message:
```json
{ "success": false, "error": "Unsupported file type. Only PDF, JPG, JPEG and PNG files are allowed." }
{ "success": false, "error": "File is too large. Maximum allowed size is 5 MB." }
{ "success": false, "error": "File content does not match its type. Please upload a genuine PDF or image file." }
{ "success": false, "error": "Product not found or access denied." }
```

---

## 3. Download / Preview Endpoint

```http
GET /api/invoices/{invoice_id}/download          → forces a file download
GET /api/invoices/{invoice_id}/download?preview=1 → inline preview (images & PDF)
```

- Requires the `Authorization: Bearer` header — files are never exposed by URL alone.
- Responds with the raw file bytes and the server-verified MIME type
  (`application/pdf`, `image/jpeg`, `image/png`).
- Security headers: `Content-Disposition: attachment; filename="original_name.ext"`,
  `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.
  Inline mode is only allowed for verified PDF/image types, and uploaded files are
  never executed — they are only stored and streamed back.

---

## 4. Security Design Summary (viva talking points)

| Threat | Defence |
|---|---|
| Malicious file disguised as an invoice | Extension whitelist **and** magic-byte content verification (`%PDF`, `\xff\xd8\xff`, `\x89PNG\r\n\x1a\n`) |
| Oversized uploads / memory exhaustion | Client check + encoded-length check before decode + decoded-size check + 7 MB request-body cap returning `413` |
| Path traversal (`../../database/vaultly.db`) | Stored names are 100% server-generated (`invoice_u{user}_p{product}_{timestamp}_{uuid}.{ext}`); only `os.path.basename` of the user's name is kept for display; download paths are re-validated to stay inside `backend/uploads/` |
| Accessing another user's files | Every query joins `Invoices` → `Products` and filters `WHERE p.user_id = ?`; downloads resolve the file only after the ownership check |
| Executing uploaded files | Files are only written to `backend/uploads/` and streamed with `nosniff` + `attachment` disposition; never opened, imported, or executed |
| Corrupted Base64 | `base64.b64decode(..., validate=True)` rejects malformed payloads with a clear error |

---

## 5. Database Changes (safe migration)

`backend/invoices.py::ensure_invoice_schema()` runs at server startup and adds four
columns to Member 1's existing `Invoices` table **only if they are missing**
(`ALTER TABLE ADD COLUMN`, idempotent — safe to run repeatedly):

```sql
original_filename TEXT,   -- display name on the user's device
file_size         INTEGER,-- bytes (5 MB limit bookkeeping)
mime_type         TEXT,   -- verified content type (never trusted from client)
uploaded_at       TEXT    -- upload timestamp, used for newest-first merge sort
```

Member 1's `get_product_details()` (`SELECT * FROM Invoices`) automatically picks up
the new columns, so the Product Details page shows real invoice data with no changes
needed on their side.

Files live in `backend/uploads/u{user_id}/...` and are git-ignored.

---

## 6. DSA / ADA Concepts Used

- **Merge Sort (O(n log n))**: reused from Member 1's `products.py` to order invoices
  newest-first by `uploaded_at` in both `get_all_invoices()` and `get_invoices_for_product()`.
- **Hash map / dictionary lookups (O(1))**: `MIME_MAP` and `MAGIC_BYTES` map each allowed
  extension to its MIME type and content signature, replacing long if/else chains.
- **Linear scan**: the request-body size guard validates `Content-Length` before reading
  a single byte from the socket.

---

## 7. Duplicate Invoice Detection (backend-enforced)

The backend checks — inside the upload transaction, before saving — whether the same
user already has an invoice with the **same seller AND same invoice number**
(case-insensitive). The check runs on the server, never only in the browser.

**Rules:**
- The check only runs when **both** `seller` and `invoice_number` are provided
  (with either one missing there is nothing reliable to compare).
- Comparison is **case-insensitive** (`COLLATE NOCASE`): `"amazon"` matches `"Amazon"`.
- The check is **per-user** (scoped through the `Products` join), so the same
  seller/number for two different users is never flagged.
- Different seller + same number, or vice versa, is **not** a duplicate.

**When a possible duplicate exists** — nothing is saved, and the API returns:

`409 Conflict`
```json
{
  "success": false,
  "duplicate": true,
  "error": "Possible duplicate: an invoice from \"Amazon\" with number \"INV-2026-001\" already exists. Review it, or confirm to save anyway.",
  "existing_invoice": { "invoice_id": 12, "invoice_number": "INV-2026-001", "seller": "Amazon", "invoice_date": "2026-02-15", "original_filename": "receipt.pdf", "uploaded_at": "..." }
}
```

The frontend (`InvoiceUploader.jsx`) turns this into a warning card showing the existing
record with three choices:
1. **Review Existing** → opens the invoice details page (`/invoices/{id}`)
2. **Save Anyway (I confirm)** → retries the same upload with `force: true`
3. **Cancel** → nothing is stored

`force: true` is the only way past the check, and it only ever comes from an explicit
user confirmation — an accidental double-click or a retried request cannot create a
duplicate silently. Note the normal submit button is replaced by this warning card,
so the accidental path (plain re-submit) still hits the check.

**No file is written when a duplicate is rejected** — the file save and the row insert
both happen inside the same transaction, after the duplicate check passes.

### How the duplicate check works (implementation)

```
prisma.$transaction(async (tx) => {
  1. if (!force && seller && invoice_number)
       SELECT ... FROM Invoices i JOIN Products p ...
       WHERE p.user_id = :me
         AND i.invoice_number = :number COLLATE NOCASE
         AND i.seller = :seller COLLATE NOCASE
       LIMIT 1
     → if found: abort (return 409 with the existing record)
  2. write the file into uploads/u{user_id}/
  3. INSERT the invoice row
}) — commit, or rollback (and the written file is deleted) on any error
```

### Concurrency: how simultaneous identical requests behave

The naive design (check in one query, insert in another) has a **TOCTOU race**:
two identical uploads could both pass the check milliseconds apart and both insert.
Vaultly closes this race as follows:

1. **Check and insert run inside a single interactive transaction**
   (`prisma.$transaction`), not as two independent queries.
2. **SQLite allows only one writer at a time.** All writes to the database are
   serialized by SQLite's file lock, and both Vaultly processes (dev/production)
   open the same `database/vaultly.db`.
3. Therefore two concurrent identical uploads cannot interleave:
   - If the first transaction has already committed when the second's check runs,
     the second sees the row and is rejected with `409`.
   - If they truly race for the write lock, SQLite blocks or rejects one
     transaction (`SQLITE_BUSY`); the second one does not commit until the first
     is finished, so its re-check sees the first's invoice.
4. Because the file write is *inside* the transaction, a rollback can never leave
   an orphan file, and a rejected duplicate can never leave a stored file.

**Extra hardening (optional, not enabled):** a partial unique index
`UNIQUE(user_id, seller, invoice_number)` would make duplicates *impossible* even
under bug-level race conditions — but it would also forbid the documented
deliberate "save anyway" exception, so Vaultly enforces duplicates via the
transactional check instead.

---

## 8. Authentication: HttpOnly cookies + 7-day sessions

Sessions now live in the **database** (`Sessions` table) instead of server memory:

| Property | Value |
|---|---|
| Token | 256-bit cryptographically secure random hex |
| Storage | `Sessions` table (token, user_id, expires_at, created_at) |
| Lifetime | **7 days** (`expires_at`), auto-purged on expiry |
| Transport | `Set-Cookie: vaultly_session=...; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax` |
| Fallback | `Authorization: Bearer <token>` still works (API clients / future mobile app) |

Consequences:
- **Restarting the server no longer logs users out** — sessions live in SQLite, and the
  React app re-validates via `GET /api/me` on load (`App.jsx` no longer trusts
  localStorage).
- The cookie is **HttpOnly**, so JavaScript/XSS cannot read the token.
- `logout` deletes the DB row and clears the cookie (`Max-Age=0`).
- `SameSite=Lax` blocks the cookie being sent by cross-site request forgery.
- Every protected endpoint resolves the user via cookie-or-Bearer
  (`getUserIdFromRequest`), so nothing else changed.

---

## 9. Testing

```bash
python3 backend/test_invoices.py
```

32 tests cover: valid uploads (PNG/PDF), rejected extensions/empty files, magic-byte
mismatches, the 5 MB limit (6 MB rejected, 4 MB accepted), corrupted Base64, path
traversal attempts, cross-user upload/read/download/delete denial, newest-first
merge-sort ordering, and deletion removing both the row and the file.
They run against an isolated temp database + temp uploads directory.

Part C adds explicit product-linking tests plus cookie/session/duplicate tests
(sections 8–10): upload to a nonexistent product, cross-user re-link rejection,
HttpOnly cookie login/logout, forged-cookie rejection, per-user duplicate scope
(case-insensitive, `409` with the existing record, `force` exception, no orphan
files) — **53 total, all passing** (`npm test` from `backend-node/`).

The Python-era suite (`backend/test_invoices.py`) predates these features and is
kept only as reference for the legacy backend.

Member 1's suite is unaffected: `python3 backend/test_suite.py` → 39 passed.
