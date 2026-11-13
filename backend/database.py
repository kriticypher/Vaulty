"""
database.py - Shared SQLite database connection & setup for Vaultly.
Provides connection helper with foreign key enforcement and row factory.
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

if __name__ == "__main__":
    conn = get_connection()
    print(f"Connected successfully to SQLite database at: {DB_PATH}")
    conn.close()
