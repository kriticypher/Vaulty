"""
dashboard.py - Dashboard analytics and aggregation module for Vaultly (Member 1).
Executes SQL aggregation queries (COUNT, SUM, AVG, GROUP BY) scoped strictly to user_id.
"""

from database import get_connection
from datetime import date

def _row_to_dict(row):
    if row is None:
        return None
    return dict(row)

def get_dashboard_stats(user_id: int) -> dict:
    """
    Computes all statistics and aggregations for the user dashboard.
    Uses SQL GROUP BY, JOINs, and parameterized queries.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()

        # 1. Total products count
        cur.execute("SELECT COUNT(*) as count FROM Products WHERE user_id = ?", (user_id,))
        total_products = cur.fetchone()["count"]

        # 2. Total purchase expenditure
        cur.execute("SELECT COALESCE(SUM(price), 0.0) as total FROM Products WHERE user_id = ?", (user_id,))
        total_spending = round(cur.fetchone()["total"], 2)

        # 3. Distinct categories count
        cur.execute(
            "SELECT COUNT(DISTINCT category) as count FROM Products WHERE user_id = ? AND category IS NOT NULL AND category != ''",
            (user_id,)
        )
        total_categories = cur.fetchone()["count"]

        # 4. Average product price
        cur.execute("SELECT COALESCE(AVG(price), 0.0) as avg_price FROM Products WHERE user_id = ?", (user_id,))
        avg_price = round(cur.fetchone()["avg_price"], 2)

        # 5. Most expensive product
        cur.execute(
            "SELECT product_id, name, brand, price, category FROM Products WHERE user_id = ? ORDER BY price DESC LIMIT 1",
            (user_id,)
        )
        most_expensive = _row_to_dict(cur.fetchone())

        # 6. Recently added products (5 most recent)
        cur.execute(
            """SELECT product_id, name, brand, category, price, purchase_date
               FROM Products
               WHERE user_id = ?
               ORDER BY created_at DESC
               LIMIT 5""",
            (user_id,)
        )
        recent_products = [_row_to_dict(r) for r in cur.fetchall()]

        # 7. Category-wise spending (SQL GROUP BY)
        cur.execute(
            """SELECT category, COUNT(*) as product_count, ROUND(SUM(price), 2) as total_spent
               FROM Products
               WHERE user_id = ? AND category IS NOT NULL AND category != ''
               GROUP BY category
               ORDER BY total_spent DESC""",
            (user_id,)
        )
        category_spending = [_row_to_dict(r) for r in cur.fetchall()]

        # 8. Monthly purchase spending (SQL GROUP BY month)
        cur.execute(
            """SELECT substr(purchase_date, 1, 7) as month,
                      COUNT(*) as product_count,
                      ROUND(SUM(price), 2) as total_spent
               FROM Products
               WHERE user_id = ? AND purchase_date IS NOT NULL
               GROUP BY month
               ORDER BY month DESC
               LIMIT 12""",
            (user_id,)
        )
        monthly_spending = [_row_to_dict(r) for r in cur.fetchall()]

        # 9. Upcoming warranties expiring within 30 days (Member 3 integration hook)
        today_str = date.today().isoformat()
        cur.execute(
            """SELECT w.warranty_id, p.product_id, p.name as product_name, w.expiry_date,
                      CAST(julianday(w.expiry_date) - julianday(?) AS INTEGER) as days_remaining
               FROM Warranties w
               JOIN Products p ON w.product_id = p.product_id
               WHERE p.user_id = ?
                 AND julianday(w.expiry_date) >= julianday(?)
                 AND julianday(w.expiry_date) <= julianday(?, '+30 days')
               ORDER BY w.expiry_date ASC""",
            (today_str, user_id, today_str, today_str)
        )
        upcoming_warranties = [_row_to_dict(r) for r in cur.fetchall()]

        # 10. Upcoming return deadlines within 7 days (Member 3 integration hook)
        cur.execute(
            """SELECT r.return_id, p.product_id, p.name as product_name, r.return_deadline, r.return_status,
                      CAST(julianday(r.return_deadline) - julianday(?) AS INTEGER) as days_remaining
               FROM Returns r
               JOIN Products p ON r.product_id = p.product_id
               WHERE p.user_id = ?
                 AND r.return_status = 'Pending'
                 AND julianday(r.return_deadline) >= julianday(?)
                 AND julianday(r.return_deadline) <= julianday(?, '+7 days')
               ORDER BY r.return_deadline ASC""",
            (today_str, user_id, today_str, today_str)
        )
        upcoming_returns = [_row_to_dict(r) for r in cur.fetchall()]

        return {
            "total_products": total_products,
            "total_spending": total_spending,
            "total_categories": total_categories,
            "avg_price": avg_price,
            "most_expensive": most_expensive,
            "recent_products": recent_products,
            "category_spending": category_spending,
            "monthly_spending": monthly_spending,
            "upcoming_warranties": upcoming_warranties,
            "upcoming_returns": upcoming_returns
        }
    finally:
        conn.close()

def get_analytics_data(user_id: int) -> dict:
    """
    Returns analytics aggregates including category counts and expenditure distribution.
    """
    stats = get_dashboard_stats(user_id)
    return {
        "total_spending": stats["total_spending"],
        "total_products": stats["total_products"],
        "avg_price": stats["avg_price"],
        "most_expensive": stats["most_expensive"],
        "category_spending": stats["category_spending"],
        "monthly_spending": stats["monthly_spending"]
    }
