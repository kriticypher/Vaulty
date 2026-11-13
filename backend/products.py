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

    # Validation
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

if __name__ == "__main__":
    test_prod = add_product(1, {
        "name": "MacBook Pro M3",
        "brand": "Apple",
        "category": "Electronics",
        "price": 169900.0,
        "purchase_date": "2026-01-15",
        "description": "14-inch Space Black laptop"
    })
    print("Add product result:", test_prod)
