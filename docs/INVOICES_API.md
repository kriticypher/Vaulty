# Vaultly Invoice Module Documentation (Member 2 - Invoices & Documents)

**Module Owner:** Member 2
**Depends on:** Member 1's authentication, shared SQLite database and product table

---

## 1. What This Module Adds

| Feature | Where |
|---|---|
| Upload PDF / JPG / JPEG / PNG invoices (max 5 MB) | `POST /api/products/{id}/invoices` |
| Browse all of the user's saved invoices | `GET /api/invoices` |
| List invoices of one product | `GET /api/products/{id}/invoices` |
| Download / preview a stored invoice | `GET /api/invoices/{id}/download` |
| Delete an invoice (record + stored file) | `DELETE /api/invoices/{id}` |

Frontend pieces:
- `frontend/src/pages/Invoices.jsx` — central Invoices page (replaces Member 1's placeholder route)
- `frontend/src/components/InvoiceUploader.jsx` — reusable upload widget
- `frontend/src/components/InvoiceList.jsx` — reusable list with Preview / Download / Delete
- `frontend/src/services/invoiceService.js` — API calls + client-side validation
- Product details page now shows an "Invoices & Receipts" section instead of the placeholder card

---

## 2. Upload Transfer Format (Base64 JSON)

`http.server` has no `multipart/form-data` parser in the standard library, so uploads
use a documented JSON envelope. The frontend reads the file with
`FileReader.readAsDataURL()` and sends only the Base64 payload:

```http
POST /api/products/3/invoices
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "file_name": "receipt.pdf",
  "file_data": "JVBERi0xLjQK...",
  "invoice_number": "INV-2026-001",
  "seller": "Amazon",
  "invoice_date": "2026-02-15"
}
```

Notes:
- `file_name` and `file_data` are required; the three metadata fields are optional.
- `file_data` is plain Base64 (no `data:` prefix, no newlines).
- **Size is enforced BEFORE decoding**: the encoded string may not exceed
  `ceil(5 MB / 3) * 4 ≈ 6.99 MB` characters, and the whole request body is capped
  at 7 MB (`Content-Length > 7 MB` returns `413` before the body is even read).

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

## 7. Testing

```bash
python3 backend/test_invoices.py
```

32 tests cover: valid uploads (PNG/PDF), rejected extensions/empty files, magic-byte
mismatches, the 5 MB limit (6 MB rejected, 4 MB accepted), corrupted Base64, path
traversal attempts, cross-user upload/read/download/delete denial, newest-first
merge-sort ordering, and deletion removing both the row and the file.
They run against an isolated temp database + temp uploads directory.

Member 1's suite is unaffected: `python3 backend/test_suite.py` → 39 passed.
