"""
test_suite.py - Comprehensive Unit & Integration Test Suite for Vaultly (Member 1).
Covers Authentication, Product CRUD, Security/Ownership, Dashboard Analytics, and DSA algorithms.
Run with: python3 backend/test_suite.py
"""

import os
import sys
import tempfile
import sqlite3

# Set test environment to use an isolated temporary database
test_db_file = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
test_db_path = test_db_file.name
test_db_file.close()

import database
database.DB_PATH = test_db_path
database.DB_DIR = os.path.dirname(test_db_path)

from database import initialize_database, get_connection
from auth import (
    register_user,
    login_user,
    logout_user,
    get_user_id_from_token,
    hash_password,
    sessions
)
from products import (
    add_product,
    get_all_products,
    get_product_by_id,
    get_product_details,
    update_product,
    delete_product,
    merge_sort,
    linear_search
)
from dashboard import get_dashboard_stats, get_analytics_data

# Initialize fresh schema in temporary database
initialize_database()

passed_count = 0
failed_count = 0

def assert_test(test_name: str, condition: bool, details: str = ""):
    global passed_count, failed_count
    if condition:
        print(f"  [PASS] {test_name}")
        passed_count += 1
    else:
        print(f"  [FAIL] {test_name} - {details}")
        failed_count += 1

print("\n=======================================================")
print(" RUNNING VAULTLY MEMBER 1 TEST SUITE")
print("=======================================================\n")

# ── 1. AUTHENTICATION & PASSWORD SECURITY TESTS ─────────────────────────────
print("1. Authentication & Security Tests:")

# Test 1.1: Valid registration
reg1 = register_user("Alice Sharma", "alice@example.com", "mypassword123", "mypassword123")
assert_test("Valid user registration", reg1.get("success") is True, str(reg1))
user1_id = reg1.get("user_id")

# Test 1.2: Password not stored in plain text
conn = get_connection()
user_row = conn.execute("SELECT password_hash, salt FROM Users WHERE user_id = ?", (user1_id,)).fetchone()
conn.close()
assert_test("Password is NOT stored in plain text", user_row["password_hash"] != "mypassword123")
assert_test("User has unique cryptographically generated salt", len(user_row["salt"]) >= 16)

# Test 1.3: Duplicate email rejection
reg_dup = register_user("Alice Clone", "alice@example.com", "anotherpass123")
assert_test("Duplicate email is rejected", reg_dup.get("success") is False)

# Test 1.4: Short password rejection
reg_short = register_user("Bob", "bob@example.com", "123")
assert_test("Password shorter than 6 chars rejected", reg_short.get("success") is False)

# Test 1.5: Password mismatch rejection
reg_mismatch = register_user("Bob", "bob@example.com", "password123", "different123")
assert_test("Mismatched passwords rejected", reg_mismatch.get("success") is False)

# Test 1.6: Valid user login
login1 = login_user("alice@example.com", "mypassword123")
assert_test("Valid login returns session token", login1.get("success") is True and "token" in login1)
token1 = login1.get("token")

# Test 1.7: Invalid password login rejection
login_wrong = login_user("alice@example.com", "wrongpassword")
assert_test("Invalid password login rejected", login_wrong.get("success") is False)

# Test 1.8: Non-existent user login rejection
login_ghost = login_user("nobody@example.com", "anypassword")
assert_test("Non-existent user login rejected", login_ghost.get("success") is False)

# Test 1.9: Token session resolution
resolved_uid = get_user_id_from_token(token1)
assert_test("Session token resolves to correct user_id", resolved_uid == user1_id)

# Test 1.10: Logout invalidates token
logout_res = logout_user(token1)
assert_test("Logout invalidates session token", get_user_id_from_token(token1) is None)

# Register User 2 for multi-tenant isolation testing
reg2 = register_user("Bob Verma", "bob@example.com", "bobpassword123")
user2_id = reg2.get("user_id")

# ── 2. PRODUCT MANAGEMENT & CRUD TESTS ──────────────────────────────────────
print("\n2. Product Management CRUD Tests:")

# Test 2.1: Add product
p1_data = {
    "name": "Sony WH-1000XM5 Headphones",
    "brand": "Sony",
    "category": "Electronics",
    "price": 29990.0,
    "purchase_date": "2026-01-10",
    "description": "Noise cancelling wireless headphones"
}
p1 = add_product(user1_id, p1_data)
assert_test("Add product succeeds", p1.get("success") is True)
prod1_id = p1.get("product_id")

p2 = add_product(user1_id, {
    "name": "MacBook Air M2",
    "brand": "Apple",
    "category": "Electronics",
    "price": 99900.0,
    "purchase_date": "2026-02-15",
    "description": "Midnight blue 16GB"
})
prod2_id = p2.get("product_id")

p3 = add_product(user1_id, {
    "name": "Ergonomic Office Chair",
    "brand": "Featherlite",
    "category": "Furniture",
    "price": 14500.0,
    "purchase_date": "2025-11-20",
    "description": "High back mesh chair"
})
prod3_id = p3.get("product_id")

# Test 2.2: Fetch all products for user
user1_products = get_all_products(user1_id)
assert_test("Fetch all products returns 3 items for User 1", len(user1_products) == 3)

# Test 2.3: Get product details
details = get_product_details(prod1_id, user1_id)
assert_test("Get product details returns product and linked tables", details is not None and "product" in details)
assert_test("Linked invoice/warranty placeholders exist", "invoices" in details and "warranties" in details)

# Test 2.4: Update product
upd_res = update_product(prod1_id, user1_id, {
    "name": "Sony WH-1000XM5 (Updated)",
    "price": 27990.0
})
assert_test("Update product price and name", upd_res.get("success") is True)
assert_test("Updated price persisted", upd_res.get("product", {}).get("price") == 27990.0)

# Test 2.5: Negative price rejection
upd_neg = update_product(prod1_id, user1_id, {"price": -500})
assert_test("Negative price rejected in update", upd_neg.get("success") is False)

# ── 3. USER DATA ISOLATION & SECURITY TESTS ─────────────────────────────────
print("\n3. Multi-Tenant User Isolation & Security Tests:")

# Test 3.1: User 2 cannot see User 1's products
user2_products = get_all_products(user2_id)
assert_test("User 2 cannot see User 1's products", len(user2_products) == 0)

# Test 3.2: User 2 cannot view User 1's product details
details_unauthorized = get_product_by_id(prod1_id, user2_id)
assert_test("User 2 blocked from viewing User 1 product by ID", details_unauthorized is None)

# Test 3.3: User 2 cannot update User 1's product
upd_unauthorized = update_product(prod1_id, user2_id, {"name": "Hacked Product"})
assert_test("User 2 blocked from updating User 1 product", upd_unauthorized.get("success") is False)

# Test 3.4: User 2 cannot delete User 1's product
del_unauthorized = delete_product(prod1_id, user2_id)
assert_test("User 2 blocked from deleting User 1 product", del_unauthorized.get("success") is False)

# Test 3.5: SQL Injection safety via parameterized query
p_sqli = add_product(user1_id, {
    "name": "Test'; DROP TABLE Products; --",
    "brand": "Generic",
    "category": "Electronics",
    "price": 100.0,
    "purchase_date": "2026-01-01"
})
assert_test("SQL injection attempt handled safely as plain text", p_sqli.get("success") is True)
conn = get_connection()
table_check = conn.execute("SELECT count(*) as cnt FROM Products").fetchone()
conn.close()
assert_test("Products table intact after SQL injection test", table_check["cnt"] > 0)

# Clean up SQL injection test product
delete_product(p_sqli["product_id"], user1_id)

# ── 4. DSA & ADA ALGORITHMS TESTS ───────────────────────────────────────────
print("\n4. DSA and ADA Algorithm Implementation Tests:")

# Test 4.1: Linear Search by product name
searched_sony = get_all_products(user1_id, search="sony")
assert_test("Linear Search matches product by name ('sony')", len(searched_sony) == 1 and "Sony" in searched_sony[0]["name"])

# Test 4.2: Linear Search by brand
searched_apple = get_all_products(user1_id, search="apple")
assert_test("Linear Search matches product by brand ('apple')", len(searched_apple) == 1 and searched_apple[0]["brand"] == "Apple")

# Test 4.3: Category filter
filtered_furniture = get_all_products(user1_id, category="Furniture")
assert_test("Category filter returns only Furniture", len(filtered_furniture) == 1 and filtered_furniture[0]["category"] == "Furniture")

# Test 4.4: Price range filter
filtered_price = get_all_products(user1_id, min_price=20000.0, max_price=30000.0)
assert_test("Price range filter ($20,000 - $30,000)", len(filtered_price) == 1 and filtered_price[0]["price"] == 27990.0)

# Test 4.5: Merge Sort by Price Ascending
sorted_asc = get_all_products(user1_id, sort_by="price_asc")
prices_asc = [p["price"] for p in sorted_asc]
assert_test("Merge Sort: Price Low to High", prices_asc == sorted(prices_asc))

# Test 4.6: Merge Sort by Price Descending
sorted_desc = get_all_products(user1_id, sort_by="price_desc")
prices_desc = [p["price"] for p in sorted_desc]
assert_test("Merge Sort: Price High to Low", prices_desc == sorted(prices_desc, reverse=True))

# Test 4.7: Merge Sort by Purchase Date Newest First
sorted_date_desc = get_all_products(user1_id, sort_by="date_desc")
dates_desc = [p["purchase_date"] for p in sorted_date_desc]
assert_test("Merge Sort: Date Newest First", dates_desc == sorted(dates_desc, reverse=True))

# ── 5. DASHBOARD STATISTICS & ANALYTICS TESTS ───────────────────────────────
print("\n5. Dashboard Statistics & Analytics Tests:")

stats = get_dashboard_stats(user1_id)
# User 1 has: 27990 + 99900 + 14500 = 142390.0
assert_test("Dashboard total products count is 3", stats["total_products"] == 3)
assert_test("Dashboard total spending equals ₹1,42,390.0", stats["total_spending"] == 142390.0)
assert_test("Dashboard total distinct categories is 2 (Electronics, Furniture)", stats["total_categories"] == 2)
assert_test("Most expensive product is MacBook Air M2", stats["most_expensive"]["name"] == "MacBook Air M2")
assert_test("Category spending aggregates correctly (SQL GROUP BY)", len(stats["category_spending"]) == 2)
assert_test("Monthly spending breakdown populated", len(stats["monthly_spending"]) >= 2)

# Test 5.1: Delete Product
del_res = delete_product(prod3_id, user1_id)
assert_test("Delete product succeeds", del_res.get("success") is True)
after_del = get_all_products(user1_id)
assert_test("Count decrements to 2 after deletion", len(after_del) == 2)

print("\n=======================================================")
print(f" TEST SUITE SUMMARY: {passed_count} PASSED, {failed_count} FAILED")
print("=======================================================\n")

# Clean up temp database
try:
    os.remove(test_db_path)
except OSError:
    pass

sys.exit(0 if failed_count == 0 else 1)
