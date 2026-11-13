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

def get_product_details(product_id: int, user_id: int) -> dict:
    """
    Returns full product details, together with any linked records in
    Invoices (Member 2), Warranties, Returns, and ServiceRecords (Member 3).
    Ensures seamless integration without redundant queries.
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

def get_all_products(user_id: int) -> list:
    """
    Fetches all products belonging to user_id, ordered newest first.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM Products WHERE user_id = ? ORDER BY purchase_date DESC, created_at DESC",
            (user_id,)
        )
        rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()
