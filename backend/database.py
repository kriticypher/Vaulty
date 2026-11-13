"""
database.py - Shared SQLite database connection & schema initialization for Vaultly.
Defines Users, Products, and prepared schemas for Invoices, Warranties, Returns, and ServiceRecords.
"""

import sqlite3
import os

DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'database'))
DB_PATH = os.path.join(DB_DIR, 'vaultly.db')

def get_connection():
    """
    Returns an SQLite connection configured with:
    1. row_factory = sqlite3.Row for dictionary-like column access.
    2. PRAGMA foreign_keys = ON to strictly enforce relational integrity.
    """
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def initialize_database():
    """
    Creates all shared tables for Vaultly if they do not exist.
    Ensures relational integrity and cascading foreign keys.
    """
    conn = get_connection()
    cur = conn.cursor()

    # 1. Users table (Member 1 - Authentication)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # 2. Products table (Member 1 - Product Management)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Products (
            product_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            brand TEXT,
            category TEXT,
            price REAL NOT NULL,
            purchase_date TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
        )
    """)

    # 3. Invoices table (Member 2 - Invoice Management integration schema)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Invoices (
            invoice_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            invoice_number TEXT,
            seller TEXT,
            invoice_date TEXT,
            file_path TEXT,
            FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
        )
    """)

    # 4. Warranties table (Member 3 - Warranty Management integration schema)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Warranties (
            warranty_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            start_date TEXT NOT NULL,
            duration_months INTEGER NOT NULL,
            expiry_date TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
        )
    """)

    # 5. Returns table (Member 3 - Return Tracking integration schema)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Returns (
            return_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            return_deadline TEXT NOT NULL,
            return_status TEXT NOT NULL DEFAULT 'Pending',
            FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
        )
    """)

    # 6. ServiceRecords table (Member 3 - Service History integration schema)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ServiceRecords (
            service_id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            service_date TEXT NOT NULL,
            service_center TEXT,
            cost REAL,
            description TEXT,
            FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
        )
    """)

    conn.commit()
    conn.close()
    print("Database schema initialized successfully.")

if __name__ == "__main__":
    initialize_database()
