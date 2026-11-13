"""
auth.py - Authentication module for Vaultly (Member 1).
Implements secure user registration, password hashing with PBKDF2-HMAC-SHA256,
unique per-user salts, login validation, and token-based session management.
"""

import hashlib
import secrets
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

def login_user(email: str, password: str) -> dict:
    """
    Authenticates a user by email and password.
    Returns a secure session token and user profile on success.
    """
    email = (email or "").strip().lower()
    if not email or not password:
        return {"success": False, "error": "Email and password are required."}

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, name, email, password_hash, salt FROM Users WHERE email = ?",
            (email,)
        )
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return {"success": False, "error": "Invalid email or password."}

    # Verify entered password with the user's unique salt
    computed_hash = hash_password(password, row["salt"])
    if computed_hash != row["password_hash"]:
        return {"success": False, "error": "Invalid email or password."}

    # Generate cryptographically unpredictable 256-bit token
    token = secrets.token_hex(SESSION_TOKEN_BYTES)
    sessions[token] = row["user_id"]

    return {
        "success": True,
        "token": token,
        "user": {
            "user_id": row["user_id"],
            "name": row["name"],
            "email": row["email"]
        }
    }

def logout_user(token: str) -> dict:
    """
    Invalidates the given session token.
    """
    if token in sessions:
        del sessions[token]
    return {"success": True, "message": "Logged out successfully."}

def get_user_id_from_token(token: str):
    """
    Validates token and returns the corresponding user_id.
    Returns None if token is invalid or missing.
    """
    if not token:
        return None
    return sessions.get(token)

def get_user_profile(user_id: int) -> dict:
    """
    Retrieves user profile info without exposing sensitive credentials.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, name, email, created_at FROM Users WHERE user_id = ?",
            (user_id,)
        )
        row = cur.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()

if __name__ == "__main__":
    login_res = login_user("test@vaultly.com", "password123")
    print("Login test result:", login_res)
    if login_res.get("success"):
        token = login_res["token"]
        print("Token verification:", get_user_id_from_token(token))
        logout_res = logout_user(token)
        print("Logout test result:", logout_res)
        print("Token verification post-logout:", get_user_id_from_token(token))
