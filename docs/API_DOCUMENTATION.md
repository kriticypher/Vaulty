# Vaultly API Documentation (Member 1 - Foundation & Core)

Base URL: `http://localhost:8000`

All endpoints return JSON responses. Protected endpoints require the HTTP header:
```http
Authorization: Bearer <session_token>
```

---

## 1. Authentication Endpoints

### `POST /api/register`
Creates a new user account. Passwords are never stored in plain text; they are hashed with PBKDF2-HMAC-SHA256 with 100,000 iterations and a unique 16-byte random salt.

**Request Body:**
```json
{
  "name": "Kriti Maurya",
  "email": "kriti@example.com",
  "password": "securepassword123",
  "confirm_password": "securepassword123"
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully.",
  "user_id": 1
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Email is already registered. Please login instead."
}
```

---

### `POST /api/login`
Authenticates user credentials and issues an unpredictable 256-bit cryptographically secure session token.

**Request Body:**
```json
{
  "email": "kriti@example.com",
  "password": "securepassword123"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "token": "4f9c2d1b8e7a605f...",
  "user": {
    "user_id": 1,
    "name": "Kriti Maurya",
    "email": "kriti@example.com"
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid email or password."
}
```

---

### `POST /api/logout`
Invalidates the current session token.

**Headers:** `Authorization: Bearer <token>`

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

---

### `GET /api/me`
Retrieves the profile of the currently logged-in user.

**Headers:** `Authorization: Bearer <token>`

**Success Response (200 OK):**
```json
{
  "user": {
    "user_id": 1,
    "name": "Kriti Maurya",
    "email": "kriti@example.com",
    "created_at": "2026-11-13 10:30:00"
  }
}
```

---

## 2. Product Management Endpoints

### `GET /api/products`
Retrieves all products belonging to the logged-in user. Supports optional query parameters for search, category filtering, price filtering, and merge sort.

**Query Parameters (Optional):**
- `search` (string): Linear search substring matching product name or brand.
- `category` (string): Exact category filter (e.g. `Electronics`).
- `min_price` (float): Minimum price threshold.
- `max_price` (float): Maximum price threshold.
- `sort_by` (string):
  - `price_asc`: Sorts by price low to high (Merge Sort)
  - `price_desc`: Sorts by price high to low (Merge Sort)
  - `date_desc`: Sorts by purchase date newest first (Merge Sort)
  - `date_asc`: Sorts by purchase date oldest first (Merge Sort)

**Headers:** `Authorization: Bearer <token>`

**Success Response (200 OK):**
```json
{
  "products": [
    {
      "product_id": 1,
      "user_id": 1,
      "name": "Sony WH-1000XM5 Headphones",
      "brand": "Sony",
      "category": "Electronics",
      "price": 29990.0,
      "purchase_date": "2026-01-10",
      "description": "Noise cancelling wireless headphones",
      "created_at": "2026-11-13 10:45:00"
    }
  ]
}
```

---

### `POST /api/products`
Creates a new product record. Uses parameterized SQL queries and enforces validation.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "MacBook Air M2",
  "brand": "Apple",
  "category": "Electronics",
  "price": 99900.0,
  "purchase_date": "2026-02-15",
  "description": "16GB RAM Midnight Blue"
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "product_id": 2,
  "product": {
    "product_id": 2,
    "user_id": 1,
    "name": "MacBook Air M2",
    "brand": "Apple",
    "category": "Electronics",
    "price": 99900.0,
    "purchase_date": "2026-02-15",
    "description": "16GB RAM Midnight Blue",
    "created_at": "2026-11-13 11:00:00"
  }
}
```

---

### `GET /api/products/{id}`
Fetches details of a single product. Includes placeholder arrays from linked tables (Invoices, Warranties, Returns, ServiceRecords) for Members 2 and 3.

**Headers:** `Authorization: Bearer <token>`

**Success Response (200 OK):**
```json
{
  "product": {
    "product_id": 1,
    "user_id": 1,
    "name": "Sony WH-1000XM5 Headphones",
    "brand": "Sony",
    "category": "Electronics",
    "price": 29990.0,
    "purchase_date": "2026-01-10",
    "description": "Noise cancelling headphones"
  },
  "invoices": [],
  "warranties": [],
  "returns": [],
  "services": []
}
```

---

### `PUT /api/products/{id}`
Updates an existing product. Only the user who owns the product can modify it.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Sony WH-1000XM5 (Updated)",
  "brand": "Sony",
  "category": "Electronics",
  "price": 27990.0,
  "purchase_date": "2026-01-10",
  "description": "Price revised"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Product updated successfully.",
  "product": {
    "product_id": 1,
    "user_id": 1,
    "name": "Sony WH-1000XM5 (Updated)",
    "price": 27990.0
  }
}
```

---

### `DELETE /api/products/{id}`
Deletes a product record. SQLite `ON DELETE CASCADE` constraint safely deletes dependent child records without orphans.

**Headers:** `Authorization: Bearer <token>`

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Product deleted successfully."
}
```

---

## 3. Dashboard & Analytics Endpoints

### `GET /api/dashboard`
Returns live calculated statistics, spending summaries, category counts, recently added products, and reminder alerts.

**Headers:** `Authorization: Bearer <token>`

**Success Response (200 OK):**
```json
{
  "total_products": 5,
  "total_spending": 142390.0,
  "total_categories": 3,
  "avg_price": 28478.0,
  "most_expensive": {
    "product_id": 2,
    "name": "MacBook Air M2",
    "price": 99900.0
  },
  "recent_products": [...],
  "category_spending": [
    { "category": "Electronics", "product_count": 3, "total_spent": 127890.0 },
    { "category": "Furniture", "product_count": 2, "total_spent": 14500.0 }
  ],
  "monthly_spending": [
    { "month": "2026-02", "product_count": 1, "total_spent": 99900.0 },
    { "month": "2026-01", "product_count": 2, "total_spent": 29990.0 }
  ],
  "upcoming_warranties": [],
  "upcoming_returns": []
}
```

---

### `GET /api/analytics`
Returns aggregate spending distribution and monthly trends for the dedicated Analytics screen.
