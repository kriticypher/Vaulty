"""
products.py - Product management module for Vaultly (Member 1).
Implements complete CRUD, database insertion, ownership enforcement,
and DSA algorithms (Merge Sort for sorting, Linear Search for searching).
"""

from database import get_connection

def _row_to_dict(row):
    """Converts an sqlite3.Row object into a standard Python dictionary."""
    if row is None:
        return None
    return dict(row)

# ── DSA: MERGE SORT ALGORITHM ───────────────────────────────────────────────
# Problem: Sort products by numerical price or ISO purchase date string.
# Time Complexity:  O(n log n) in best, average, and worst cases.
# Space Complexity: O(n) auxiliary memory for merged subarrays.
# Academic explanation:
# Divide and Conquer approach: divide list into two halves until length <= 1,
# recursively sort each half, and merge the sorted halves in linear O(n) time.
def merge_sort(arr: list, key_fn, reverse: bool = False) -> list:
    """
    Pure Python merge sort implementation.
    key_fn: lambda extracting the comparison value from each element.
    reverse: True for descending order, False for ascending.
    """
    if len(arr) <= 1:
        return arr

    mid = len(arr) // 2
    left = merge_sort(arr[:mid], key_fn, reverse)
    right = merge_sort(arr[mid:], key_fn, reverse)

    return _merge(left, right, key_fn, reverse)

def _merge(left: list, right: list, key_fn, reverse: bool) -> list:
    result = []
    i = j = 0

    while i < len(left) and j < len(right):
        val_left = key_fn(left[i])
        val_right = key_fn(right[j])

        # Normalize None values to avoid comparison errors
        if val_left is None:
            val_left = "" if isinstance(val_right, str) else 0
        if val_right is None:
            val_right = "" if isinstance(val_left, str) else 0

        condition = (val_left >= val_right) if reverse else (val_left <= val_right)

        if condition:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1

    result.extend(left[i:])
    result.extend(right[j:])
    return result

# ── DSA: LINEAR SEARCH ALGORITHM ────────────────────────────────────────────
# Problem: Search for a query substring across product names and brand names.
# Time Complexity:  O(n) where n is the number of products.
# Space Complexity: O(1) auxiliary space (excluding matched result output).
# Academic explanation:
# Sequentially inspects each product in the collection and performs a case-insensitive
# substring search against product name and brand.
def linear_search(products: list, query: str) -> list:
    """
    Performs linear search matching query string inside product name or brand.
    """
    if not query:
        return products

    query = query.strip().lower()
    matched = []
    for product in products:
        name = (product.get("name") or "").lower()
        brand = (product.get("brand") or "").lower()
        if query in name or query in brand:
            matched.append(product)
    return matched

# ── PRODUCT CRUD OPERATIONS ──────────────────────────────────────────────────

def add_product(user_id: int, data: dict) -> dict:
    """
    Inserts a new product belonging to user_id.
    Performs data validation and uses parameterized SQL to prevent SQL injection.
    """
    name = (data.get("name") or "").strip()
    brand = (data.get("brand") or "").strip()
    category = (data.get("category") or "").strip()
    price_raw = data.get("price")
    purchase_date = (data.get("purchase_date") or "").strip()
    description = (data.get("description") or "").strip()

    if not name:
        return {"success": False, "error": "Product name is required."}
    if price_raw is None or price_raw == "":
        return {"success": False, "error": "Price is required."}

    try:
        price = float(price_raw)
        if price < 0:
            return {"success": False, "error": "Price cannot be negative."}
    except (ValueError, TypeError):
        return {"success": False, "error": "Price must be a valid number."}

    if not purchase_date:
        return {"success": False, "error": "Purchase date is required."}

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO Products (user_id, name, brand, category, price, purchase_date, description)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (user_id, name, brand or None, category or None, price, purchase_date, description or None)
        )
        conn.commit()
        product_id = cur.lastrowid
        return {
            "success": True,
            "product_id": product_id,
            "product": get_product_by_id(product_id, user_id)
        }
    except Exception as e:
        return {"success": False, "error": f"Database insertion failed: {str(e)}"}
    finally:
        conn.close()

def get_product_by_id(product_id: int, user_id: int) -> dict:
    """
    Fetches a single product by ID.
    Ownership Check: Strictly enforces WHERE user_id = ? so users cannot view others' records.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM Products WHERE product_id = ? AND user_id = ?",
            (product_id, user_id)
        )
        row = cur.fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()

def get_product_details(product_id: int, user_id: int) -> dict:
    """
    Returns full product details, together with any linked records in
    Invoices (Member 2), Warranties, Returns, and ServiceRecords (Member 3).
    """
    product = get_product_by_id(product_id, user_id)
    if not product:
        return None

    conn = get_connection()
    try:
        cur = conn.cursor()

        # Linked invoices (Member 2)
        cur.execute("SELECT * FROM Invoices WHERE product_id = ?", (product_id,))
        invoices = [_row_to_dict(r) for r in cur.fetchall()]

        # Linked warranties (Member 3)
        cur.execute("SELECT * FROM Warranties WHERE product_id = ?", (product_id,))
        warranties = [_row_to_dict(r) for r in cur.fetchall()]

        # Linked returns (Member 3)
        cur.execute("SELECT * FROM Returns WHERE product_id = ?", (product_id,))
        returns = [_row_to_dict(r) for r in cur.fetchall()]

        # Linked service records (Member 3)
        cur.execute("SELECT * FROM ServiceRecords WHERE product_id = ? ORDER BY service_date DESC", (product_id,))
        services = [_row_to_dict(r) for r in cur.fetchall()]

        return {
            "product": product,
            "invoices": invoices,
            "warranties": warranties,
            "returns": returns,
            "services": services
        }
    finally:
        conn.close()

def update_product(product_id: int, user_id: int, data: dict) -> dict:
    """
    Updates an existing product.
    Enforces user ownership and validates all updated parameters.
    """
    existing = get_product_by_id(product_id, user_id)
    if not existing:
        return {"success": False, "error": "Product not found or access denied."}

    name = (data.get("name") or existing["name"]).strip()
    brand = (data.get("brand") or existing["brand"])
    category = (data.get("category") or existing["category"])
    price_raw = data.get("price", existing["price"])
    purchase_date = (data.get("purchase_date") or existing["purchase_date"]).strip()
    description = (data.get("description") or existing["description"])

    if not name:
        return {"success": False, "error": "Product name cannot be empty."}

    try:
        price = float(price_raw)
        if price < 0:
            return {"success": False, "error": "Price cannot be negative."}
    except (ValueError, TypeError):
        return {"success": False, "error": "Price must be a valid number."}

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """UPDATE Products
               SET name = ?, brand = ?, category = ?, price = ?, purchase_date = ?, description = ?
               WHERE product_id = ? AND user_id = ?""",
            (name, brand, category, price, purchase_date, description, product_id, user_id)
        )
        conn.commit()
        return {
            "success": True,
            "message": "Product updated successfully.",
            "product": get_product_by_id(product_id, user_id)
        }
    except Exception as e:
        return {"success": False, "error": f"Update failed: {str(e)}"}
    finally:
        conn.close()

def delete_product(product_id: int, user_id: int) -> dict:
    """
    Deletes a product if it belongs to user_id.
    Foreign key ON DELETE CASCADE safely cleans up related child records.
    """
    existing = get_product_by_id(product_id, user_id)
    if not existing:
        return {"success": False, "error": "Product not found or access denied."}

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM Products WHERE product_id = ? AND user_id = ?",
            (product_id, user_id)
        )
        conn.commit()
        return {"success": True, "message": "Product deleted successfully."}
    except Exception as e:
        return {"success": False, "error": f"Deletion failed: {str(e)}"}
    finally:
        conn.close()

def get_all_products(user_id: int, search: str = "", category: str = "",
                     min_price: float = None, max_price: float = None,
                     sort_by: str = "") -> list:
    """
    Fetches all products belonging to user_id, applying:
    1. Database retrieval scoped to user_id
    2. DSA Linear Search (name / brand)
    3. Category and price range filtering
    4. DSA Merge Sort (by price or date)
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM Products WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        )
        products = [_row_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    # 1. Apply DSA Linear Search
    if search:
        products = linear_search(products, search)

    # 2. Filter by Category
    if category:
        products = [p for p in products if (p.get("category") or "").lower() == category.lower()]

    # 3. Filter by Price Range
    if min_price is not None:
        products = [p for p in products if p.get("price", 0) >= min_price]
    if max_price is not None:
        products = [p for p in products if p.get("price", 0) <= max_price]

    # 4. Apply DSA Merge Sort
    if sort_by == "price_asc":
        products = merge_sort(products, key_fn=lambda p: p.get("price", 0), reverse=False)
    elif sort_by == "price_desc":
        products = merge_sort(products, key_fn=lambda p: p.get("price", 0), reverse=True)
    elif sort_by == "date_asc":
        products = merge_sort(products, key_fn=lambda p: p.get("purchase_date") or "", reverse=False)
    elif sort_by == "date_desc":
        products = merge_sort(products, key_fn=lambda p: p.get("purchase_date") or "", reverse=True)

    return products
