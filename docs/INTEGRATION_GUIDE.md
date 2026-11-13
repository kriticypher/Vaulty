# Vaultly Team Integration Guide

**Author:** Member 1 (Project Foundation, Auth & Product Management)  
**Target Audience:** Member 2 (Invoices & OCR), Member 3 (Warranties, Returns & Services)

---

## 1. Architecture & Shared Database

Vaultly uses a single shared SQLite database located at:
```
database/vaultly.db
```

SQLite foreign keys are strictly enforced via:
```python
conn.execute("PRAGMA foreign_keys = ON")
```

The database connection is established through `backend/database.py`:
```python
from database import get_connection

conn = get_connection()
# conn is configured with sqlite3.Row for dictionary-like column access
```

---

## 2. Shared Products Table Reference

Every invoice, warranty, return window, or service record **must link to an existing product** via `product_id`.

```sql
CREATE TABLE Products (
    product_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    name          TEXT    NOT NULL,
    brand         TEXT,
    category      TEXT,
    price         REAL    NOT NULL,
    purchase_date TEXT    NOT NULL,  -- Format: YYYY-MM-DD
    description   TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);
```

---

## 3. Member 2 Integration (Invoice Management & OCR)

### Prepared Table Schema
```sql
CREATE TABLE Invoices (
    invoice_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id     INTEGER NOT NULL,
    invoice_number TEXT,
    seller         TEXT,
    invoice_date   TEXT,             -- Format: YYYY-MM-DD
    file_path      TEXT,
    FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
);
```

### Endpoints to Implement in `backend/server.py`:
- `GET /api/products/{id}/invoices`
- `POST /api/products/{id}/invoices`
- `DELETE /api/invoices/{invoice_id}`

### Frontend Hook:
Member 2 should replace the placeholder page at `frontend/src/pages/PlaceholderPage.jsx` for `/invoices` with their dedicated component or attach document upload widgets to `frontend/src/pages/ProductDetails.jsx`.

---

## 4. Member 3 Integration (Warranties, Returns & Service History)

### Prepared Table Schemas

```sql
-- Warranties Table
CREATE TABLE Warranties (
    warranty_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      INTEGER NOT NULL,
    start_date      TEXT    NOT NULL,  -- Format: YYYY-MM-DD
    duration_months INTEGER NOT NULL,
    expiry_date     TEXT    NOT NULL,  -- Format: YYYY-MM-DD
    FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
);

-- Returns Table
CREATE TABLE Returns (
    return_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      INTEGER NOT NULL,
    return_deadline TEXT    NOT NULL,  -- Format: YYYY-MM-DD
    return_status   TEXT    NOT NULL DEFAULT 'Pending',
    FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
);

-- ServiceRecords Table
CREATE TABLE ServiceRecords (
    service_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id     INTEGER NOT NULL,
    service_date   TEXT    NOT NULL,  -- Format: YYYY-MM-DD
    service_center TEXT,
    cost           REAL,
    description    TEXT,
    FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
);
```

### Dashboard Reminders Hook
`backend/dashboard.py` already includes query hooks for `upcoming_warranties` (within 30 days) and `upcoming_returns` (within 7 days). As soon as Member 3 inserts records into `Warranties` and `Returns`, they will automatically surface in the main Dashboard overview!

---

## 5. Authentication & Ownership Convention

To verify that an item belongs to the authenticated user:
```python
from auth import get_user_id_from_token

token = get_bearer_token(handler)
user_id = get_user_id_from_token(token)
if not user_id:
    return send_json_response(handler, 401, {"error": "Unauthorized"})

# Verify product ownership:
conn = get_connection()
owner = conn.execute("SELECT user_id FROM Products WHERE product_id = ?", (product_id,)).fetchone()
if not owner or owner["user_id"] != user_id:
    return send_json_response(handler, 403, {"error": "Access denied"})
```
