"""
auth.py - Authentication module for Vaultly (Member 1).
Implements secure user registration, password hashing with PBKDF2-HMAC-SHA256,
unique per-user salts, login validation, and token-based session management.
"""

import hashlib
import secrets
import re
from database import get_connection

# In-memory session store mapping token -> user_id
# Simple, secure, and easily explainable in an academic viva.
sessions = {}

# 256-bit secure unpredictable session token length
SESSION_TOKEN_BYTES = 32

def hash_password(password: str, salt: str) -> str:
    """
    Hashes a plain-text password using PBKDF2-HMAC-SHA256 with 100,000 iterations.
    DSA / Security note:
    PBKDF2 is computationally intensive by design to resist brute-force and rainbow table attacks.
    Combined with a unique per-user salt, identical passwords result in completely different hashes.
    """
    dk = hashlib.pbkdf2_hmac(
        hash_name='sha256',
        password=password.encode('utf-8'),
        salt=salt.encode('utf-8'),
        iterations=100_000
    )
    return dk.hex()

def register_user(name: str, email: str, password: str, confirm_password: str = None) -> dict:
    """
    Registers a new user into the Users table.
    Validates input fields, generates a 16-byte random salt, and hashes password before storing.
    Never returns or exposes salt or password hash.
    """
    name = (name or "").strip()
    email = (email or "").strip().lower()

    if not name or not email or not password:
        return {"success": False, "error": "All fields are required."}

    if "@" not in email or "." not in email:
        return {"success": False, "error": "Please provide a valid email address."}

    if len(password) < 6:
        return {"success": False, "error": "Password must be at least 6 characters long."}

    if confirm_password is not None and password != confirm_password:
        return {"success": False, "error": "Passwords do not match."}

    # Generate a cryptographically secure random salt
    salt = secrets.token_hex(16)
    password_hash = hash_password(password, salt)

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO Users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)",
            (name, email, password_hash, salt)
        )
        conn.commit()
        user_id = cur.lastrowid
        return {
            "success": True,
            "message": "User registered successfully.",
            "user_id": user_id
        }
    except Exception as e:
        if "UNIQUE" in str(e).upper():
            return {"success": False, "error": "Email is already registered. Please login instead."}
        return {"success": False, "error": "Database error during registration."}
    finally:
        conn.close()

if __name__ == "__main__":
    test_res = register_user("Test User", "test@vaultly.com", "password123")
    print("Registration test result:", test_res)
