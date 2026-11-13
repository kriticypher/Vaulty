# Vaultly – Viva Examination Preparation Guide (Member 1)

This guide contains everything you need to confidently answer external examiner questions during your BTech Major Project viva.

---

## 1. Why Did We Choose This Technology Stack?

- **Why Python standard library instead of Flask or Django?**
  - **Zero external dependencies**: Python's built-in `http.server`, `sqlite3`, `hashlib`, and `secrets` run out of the box on any system without pip issues.
  - **Academic clarity**: In Flask/Django, decorators and ORMs hide HTTP routing, connection pooling, and SQL queries. Writing clean handlers in standard Python demonstrates deep understanding of HTTP request cycles, headers, status codes, and manual SQL query structuring.
- **Why SQLite?**
  - Self-contained, serverless, zero-configuration database stored in a single file (`database/vaultly.db`).
  - Perfect for a desktop/laptop management tool and academic project where teammates can share and inspect database tables directly.
  - Supports full ACID transactions and foreign key constraints.
- **Why React with Vite?**
  - Component-based architecture allows reusable UI elements (`Sidebar`, `StatCard`, `ProductTable`, `ProductCard`).
  - Fast client-side rendering with SPA (Single Page Application) routing via `react-router-dom`.
  - Native Fetch API avoids heavy libraries like Axios while maintaining clean async/await syntax.

---

## 2. Line-by-Line Breakdown of Key Functions

### A. Password Hashing (`backend/auth.py`)
```python
def hash_password(password: str, salt: str) -> str:
    dk = hashlib.pbkdf2_hmac(
        hash_name='sha256',
        password=password.encode('utf-8'),
        salt=salt.encode('utf-8'),
        iterations=100_000
    )
    return dk.hex()
```
- **Line by Line**:
  1. `hash_name='sha256'`: Uses Secure Hash Algorithm 256-bit as the pseudo-random underlying function.
  2. `password.encode('utf-8')`: Converts the user's string password to raw bytes.
  3. `salt.encode('utf-8')`: Unique random salt string converted to bytes.
  4. `iterations=100_000`: Applies Key Stretching 100,000 times in a loop. Even if an attacker steals the database, computing $100,000$ iterations for billions of dictionary words takes decades on a GPU.
  5. `dk.hex()`: Encodes the resulting derived key into a hexadecimal string suitable for SQLite TEXT storage.

### B. Merge Sort Implementation (`backend/products.py`)
```python
def merge_sort(arr: list, key_fn, reverse: bool = False) -> list:
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid], key_fn, reverse)
    right = merge_sort(arr[mid:], key_fn, reverse)
    return _merge(left, right, key_fn, reverse)
```
- **Line by Line**:
  1. `if len(arr) <= 1`: Base condition — a list of 0 or 1 element is already sorted.
  2. `mid = len(arr) // 2`: Divides array in half.
  3. `left = merge_sort(...)` & `right = merge_sort(...)`: Recursive conquer steps.
  4. `return _merge(...)`: Combines sorted halves in $O(n)$ time.

---

## 3. Database Design & Relational Integrity

### Database Schema Overview
- **Users**: Central user table (`user_id`, `name`, `email`, `password_hash`, `salt`).
- **Products**: Relational anchor table (`product_id`, `user_id`, `name`, `brand`, `category`, `price`, `purchase_date`, `description`).
- `FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE`
  - If a user account is deleted, all their products are automatically deleted by the database engine.
- `PRAGMA foreign_keys = ON`
  - By default, SQLite has foreign keys disabled for backward compatibility. Enabling it on every connection guarantees relational integrity.

---

## 4. 15 Key Viva Questions & Short, Correct Answers

### Q1: What is the role of Member 1 in Vaultly?
**Answer:** Member 1 is responsible for the overall project foundation, shared SQLite database schema, user authentication with password hashing, full product management CRUD, dashboard metrics, purchase analytics, and DSA sorting/searching algorithms.

### Q2: Why do you store a salt alongside the password hash?
**Answer:** A salt is a unique random string generated for each user. It prevents rainbow table attacks (precomputed hash tables) and ensures that two users with the exact same password have completely different stored hashes.

### Q3: What is the difference between SHA-256 and PBKDF2-HMAC-SHA256?
**Answer:** Plain SHA-256 is designed to be extremely fast, making it vulnerable to GPU brute-force attacks (billions of guesses per second). PBKDF2 introduces deliberate key stretching through 100,000 iterations, making brute-force guessing computationally infeasible.

### Q4: How do you prevent SQL Injection in your backend?
**Answer:** We never concatenate user inputs directly into SQL strings. We strictly use parameterized queries with `?` placeholders (e.g., `cur.execute("SELECT * FROM Products WHERE user_id = ?", (user_id,))`). The SQLite driver treats parameters purely as literals, never executable SQL commands.

### Q5: How do you prevent User A from viewing or modifying User B's products?
**Answer:** Every product endpoint extracts the authenticated `user_id` from the secure Bearer token. All database queries enforce `WHERE product_id = ? AND user_id = ?`. If User A requests product ID 5 belonging to User B, the query returns zero rows (404/403).

### Q6: Why did you choose Merge Sort over Quick Sort?
**Answer:** Merge Sort guarantees $O(n \log n)$ time complexity in all cases (worst, average, and best), whereas Quick Sort degrades to $O(n^2)$ when inputs are already sorted or reverse-sorted. Merge Sort is also stable, meaning items with identical prices maintain their original chronological order.

### Q7: What is the time and space complexity of your Linear Search?
**Answer:** Time complexity is $O(n)$ where $n$ is the number of products, as each product must be inspected. Auxiliary space complexity is $O(1)$ because matching is done in-place without auxiliary data structures.

### Q8: How does your session management work without a heavy framework?
**Answer:** Upon successful login, Python's `secrets.token_hex(32)` generates an unpredictable 256-bit cryptographically secure token stored in an in-memory dictionary `sessions[token] = user_id`. Protected endpoints read this token from the HTTP `Authorization: Bearer <token>` header.

### Q9: What happens when a user logs out?
**Answer:** The frontend calls `POST /api/logout`. The backend deletes the token entry from the `sessions` dictionary. The frontend removes the token from `localStorage` and redirects the user to the login screen.

### Q10: How does the Dashboard calculate Category Spending?
**Answer:** Using SQL aggregation: `SELECT category, COUNT(*), SUM(price) FROM Products WHERE user_id = ? GROUP BY category ORDER BY SUM(price) DESC;`. This offloads computation to SQLite in C rather than looping through all records in Python.

### Q11: What is CORS, and why did you configure it?
**Answer:** Cross-Origin Resource Sharing (CORS) is a browser security mechanism that restricts HTTP requests from one origin (`http://localhost:5173` - Vite) to another (`http://localhost:8000` - Python). We configured `Access-Control-Allow-Origin` and pre-flight `OPTIONS` headers to permit seamless local communication.

### Q12: How do Members 2 and 3 integrate with your code?
**Answer:** Both members link their records to Member 1's `Products` table using `product_id` as a foreign key. The database schema in `database.py` already includes `Invoices`, `Warranties`, `Returns`, and `ServiceRecords` tables.

### Q13: What does `ON DELETE CASCADE` do?
**Answer:** When a parent row in `Products` is deleted, SQLite automatically deletes all associated rows in child tables (`Invoices`, `Warranties`, `Returns`, `ServiceRecords`), preventing orphaned records.

### Q14: Is your session token predictable?
**Answer:** No. We use Python's `secrets` module, which draws entropy directly from the operating system's Cryptographically Secure Pseudo-Random Number Generator (CSPRNG, such as `/dev/urandom`).

### Q15: Why did you implement both Table and Grid views in the UI?
**Answer:** Table view provides a dense, searchable overview for desktop displays, while Grid view renders responsive cards that adapt seamlessly to mobile viewports.

---

## 5. Tricky Questions Examiners Might Ask & How to Answer

### Tricky Question 1:
*"If your server restarts, won't your in-memory sessions be lost?"*
- **Correct Answer:** "Yes, sir/ma'am. In this academic implementation, storing sessions in a Python dictionary keeps the project simple, beginner-friendly, and completely free of third-party dependencies like Redis. For production scale, the session store would simply be moved to a persistent `Sessions` table in SQLite or a Redis cache."

### Tricky Question 2:
*"Why didn't you use Binary Search instead of Linear Search?"*
- **Correct Answer:** "Binary Search requires the array to be strictly sorted by the search key and only works on exact equality or prefixes. Users search for arbitrary substrings (e.g. searching 'pro' inside 'MacBook Pro'). A substring search across unsorted or dynamically changing fields requires Linear Search ($O(n)$) or an inverted index / Trie for large text documents."

### Tricky Question 3:
*"What if someone sends a price like `-5000` or a string `abc`?"*
- **Correct Answer:** "Both frontend and backend validate this. In `backend/products.py`, we explicitly check `try: price = float(price_raw)` and verify `if price < 0: return error`. The database also enforces `price REAL NOT NULL`."
