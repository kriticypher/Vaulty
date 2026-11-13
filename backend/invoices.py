"""
invoices.py - Invoice upload & document management module for Vaultly (Member 2).

Implements secure invoice file uploads using ONLY Python's standard library:
- Base64 JSON transfer format (size is enforced BEFORE decoding).
- Extension whitelist (PDF, JPG, JPEG, PNG) + magic-byte content verification.
- Hard 5 MB per-file size limit.
- Safe unique server-generated file names (user-provided names are NEVER
  used as paths, which makes path traversal impossible).
- Per-user ownership enforcement (users can never touch another user's files).
- Files are only ever stored and streamed back; they are never executed.

DSA concepts: Merge Sort (reused from products.py) orders invoices newest-first,
and a hash-map (dictionary) lookup maps each allowed extension to its MIME type
and magic signature for O(1) validation.
"""

import base64
import binascii
import os
import uuid
import time
import datetime

from database import get_connection
from products import get_product_by_id, merge_sort

# ── UPLOAD SECURITY CONFIGURATION ────────────────────────────────────────────

# Hard limit: no invoice file larger than 5 MB may ever be stored.
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 * 1024 * 1024 = 5,242,880 bytes

# Base64 encoding inflates data by exactly 4/3. We enforce the limit on the
# ENCODED string BEFORE decoding, so an oversized upload never consumes memory.
MAX_BASE64_LENGTH = ((MAX_FILE_SIZE_BYTES + 2) // 3) * 4

# Root directory for stored invoices: backend/uploads/
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'uploads'))

# Whitelist: only these file extensions are accepted, nothing else.
ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png"}

# Hash map (dictionary) lookup: extension -> browser MIME type.
# O(1) lookup instead of long if/else chains (DSA concept).
MIME_MAP = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}

# Hash map lookup: extension -> magic-byte signature stored at the start of a
# genuine file. This verifies file CONTENT, not just the name a user typed.
MAGIC_BYTES = {
    "pdf": (b"%PDF",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
}


def _row_to_dict(row):
    """Converts an sqlite3.Row object into a standard Python dictionary."""
    if row is None:
        return None
    return dict(row)


# ── SCHEMA UPGRADE (documented migration, keeps Member 1's table intact) ─────

def ensure_invoice_schema():
    """
    Adds Member 2's bookkeeping columns to the shared Invoices table created by
    Member 1. Uses ALTER TABLE only when a column is missing, so running this
    on an existing database is safe and idempotent.

    New columns:
      original_filename - the name the user's file had on their device (display only)
      file_size         - stored size in bytes (used for the 5 MB limit & UI)
      mime_type         - verified content type (never taken from the client)
      uploaded_at       - ISO timestamp of the upload
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(Invoices)")
        existing_columns = {row["name"] for row in cur.fetchall()}

        migrations = [
            ("original_filename", "TEXT"),
            ("file_size", "INTEGER"),
            ("mime_type", "TEXT"),
            ("uploaded_at", "TEXT"),
        ]
        for column_name, column_type in migrations:
            if column_name not in existing_columns:
                cur.execute(f"ALTER TABLE Invoices ADD COLUMN {column_name} {column_type}")
        conn.commit()
    finally:
        conn.close()


# ── FILE NAME & PATH SAFETY ──────────────────────────────────────────────────

def _generate_safe_file_name(user_id: int, product_id: int, extension: str) -> str:
    """
    Builds a 100% server-generated file name. The user's original file name is
    never part of the stored path, so hostile names such as
    '../../database/vaultly.db' or 'shell.py' can never influence the file
    system (path traversal and execution are impossible by construction).
    """
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    unique_token = uuid.uuid4().hex[:12]  # unpredictable, collision-proof suffix
    return f"invoice_u{user_id}_p{product_id}_{timestamp}_{unique_token}.{extension}"


def _resolve_stored_path(file_path: str) -> str:
    """
    Converts the relative file_path stored in the database into an absolute
    path, then verifies it is still inside UPLOAD_DIR. This is defence in
    depth: even if the database were tampered with, a path outside the uploads
    directory can never be read.
    """
    absolute_path = os.path.abspath(os.path.join(UPLOAD_DIR, file_path))
    if not absolute_path.startswith(UPLOAD_DIR + os.sep):
        return None
    return absolute_path


# ── VALIDATION HELPERS ───────────────────────────────────────────────────────

def _extract_extension(file_name: str) -> str:
    """
    Returns the lowercased extension of the user's file name, using
    os.path.basename first so that any directory component is discarded.
    Returns '' when no extension exists.
    """
    base_name = os.path.basename((file_name or "").strip())
    if "." not in base_name:
        return ""
    return base_name.rsplit(".", 1)[1].lower()


def _has_valid_signature(file_bytes: bytes, extension: str) -> bool:
    """
    Verifies the file content starts with the genuine magic bytes for its
    claimed extension. Prevents renamed executable/HTML files from being
    stored as fake invoices.
    """
    expected_signatures = MAGIC_BYTES.get(extension, ())
    return any(file_bytes.startswith(sig) for sig in expected_signatures)


def _is_valid_date_string(date_string: str) -> bool:
    """Validates YYYY-MM-DD dates (invoice_date must match Products' format)."""
    try:
        datetime.datetime.strptime(date_string, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


# ── CORE: UPLOAD (Base64 JSON transfer format) ───────────────────────────────

def upload_invoice(product_id: int, user_id: int, data: dict) -> dict:
    """
    Stores one invoice file for an owned product.

    Expected JSON body (the documented transfer format):
    {
      "file_name": "receipt.pdf",           # original client-side name
      "file_data": "<base64 string>",       # raw Base64 of the file bytes
      "invoice_number": "INV-2026-001",     # optional metadata
      "seller": "Amazon",                   # optional metadata
      "invoice_date": "2026-02-15"          # optional metadata (YYYY-MM-DD)
    }
    """
    # 1. Ownership check: the invoice must attach to a product the user owns.
    product = get_product_by_id(product_id, user_id)
    if not product:
        return {"success": False, "error": "Product not found or access denied."}

    # 2. Extension whitelist (checks the NAME the user claims).
    original_name = (data.get("file_name") or "").strip()
    if not original_name:
        return {"success": False, "error": "A file must be selected before uploading."}

    extension = _extract_extension(original_name)
    if extension not in ALLOWED_EXTENSIONS:
        return {
            "success": False,
            "error": "Unsupported file type. Only PDF, JPG, JPEG and PNG files are allowed."
        }

    # 3. Size limit enforced on the ENCODED payload BEFORE decoding. An
    #    oversized upload is rejected before any memory is spent on it.
    file_data = data.get("file_data") or ""
    if not file_data:
        return {"success": False, "error": "The selected file appears to be empty."}
    if len(file_data) > MAX_BASE64_LENGTH:
        return {
            "success": False,
            "error": "File is too large. Maximum allowed size is 5 MB."
        }

    # 4. Decode Base64 safely (validate=True rejects malformed characters).
    try:
        file_bytes = base64.b64decode(file_data, validate=True)
    except (binascii.Error, ValueError):
        return {"success": False, "error": "The file data is corrupted. Please try uploading again."}

    # 5. Real size check on the decoded bytes (the final authority).
    if len(file_bytes) == 0:
        return {"success": False, "error": "The selected file appears to be empty."}
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        return {"success": False, "error": "File is too large. Maximum allowed size is 5 MB."}

    # 6. Content verification via magic bytes (not trusting the extension).
    if not _has_valid_signature(file_bytes, extension):
        return {
            "success": False,
            "error": "File content does not match its type. Please upload a genuine PDF or image file."
        }

    # 7. Optional metadata validation.
    invoice_number = (data.get("invoice_number") or "").strip()
    seller = (data.get("seller") or "").strip()
    invoice_date = (data.get("invoice_date") or "").strip()
    if invoice_date and not _is_valid_date_string(invoice_date):
        return {"success": False, "error": "Invoice date must use the YYYY-MM-DD format."}

    # 8. Save the bytes under uploads/u{user_id}/ with a generated safe name.
    # file_path is stored RELATIVE to UPLOAD_DIR, e.g. "u1/invoice_u1_p2_....pdf"
    stored_name = _generate_safe_file_name(user_id, product_id, extension)
    user_directory = os.path.join(UPLOAD_DIR, f"u{user_id}")
    absolute_path = os.path.join(user_directory, stored_name)
    relative_path = os.path.join(f"u{user_id}", stored_name)

    try:
        os.makedirs(user_directory, exist_ok=True)
        with open(absolute_path, "wb") as file_handle:
            file_handle.write(file_bytes)
    except OSError:
        return {"success": False, "error": "Server could not store the file. Please try again."}

    # 9. Record the invoice in the shared database (parameterized SQL only).
    uploaded_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO Invoices
                   (product_id, invoice_number, seller, invoice_date, file_path,
                    original_filename, file_size, mime_type, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                product_id,
                invoice_number or None,
                seller or None,
                invoice_date or None,
                relative_path,
                os.path.basename(original_name),  # display-only, directories stripped
                len(file_bytes),
                MIME_MAP[extension],              # O(1) dictionary lookup
                uploaded_at
            )
        )
        conn.commit()
        invoice_id = cur.lastrowid
        return {
            "success": True,
            "message": "Invoice uploaded successfully.",
            "invoice_id": invoice_id,
            "invoice": get_invoice_by_id(invoice_id, user_id)
        }
    except Exception as db_error:
        # Database insert failed: remove the orphan file so no garbage is left.
        try:
            os.remove(absolute_path)
        except OSError:
            pass
        return {"success": False, "error": f"Database insertion failed: {str(db_error)}"}
    finally:
        conn.close()


# ── QUERIES ──────────────────────────────────────────────────────────────────

def get_invoice_by_id(invoice_id: int, user_id: int) -> dict:
    """
    Fetches one invoice by ID, joined to its product so the WHERE clause can
    strictly enforce user ownership. Returns None when the invoice does not
    exist or belongs to another user.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT i.*, p.name AS product_name
               FROM Invoices i
               JOIN Products p ON p.product_id = i.product_id
               WHERE i.invoice_id = ? AND p.user_id = ?""",
            (invoice_id, user_id)
        )
        return _row_to_dict(cur.fetchone())
    finally:
        conn.close()


def get_invoices_for_product(product_id: int, user_id: int) -> list:
    """Lists every invoice attached to one owned product (newest upload first)."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT i.*, p.name AS product_name
               FROM Invoices i
               JOIN Products p ON p.product_id = i.product_id
               WHERE i.product_id = ? AND p.user_id = ?""",
            (product_id, user_id)
        )
        invoices = [_row_to_dict(row) for row in cur.fetchall()]
    finally:
        conn.close()

    # DSA: Merge Sort orders the invoices newest-first, O(n log n).
    return merge_sort(
        invoices,
        key_fn=lambda inv: inv.get("uploaded_at") or "",
        reverse=True
    )


def get_all_invoices(user_id: int) -> list:
    """Lists every invoice owned by the user across all products (newest first)."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT i.*, p.name AS product_name
               FROM Invoices i
               JOIN Products p ON p.product_id = i.product_id
               WHERE p.user_id = ?""",
            (user_id,)
        )
        invoices = [_row_to_dict(row) for row in cur.fetchall()]
    finally:
        conn.close()

    # DSA: Merge Sort reused from Member 1's products module, O(n log n).
    return merge_sort(
        invoices,
        key_fn=lambda inv: inv.get("uploaded_at") or "",
        reverse=True
    )


# ── DOWNLOAD SUPPORT ─────────────────────────────────────────────────────────

def get_invoice_file(invoice_id: int, user_id: int) -> dict:
    """
    Prepares an owned invoice for download/preview.
    Returns a dictionary with everything the HTTP layer needs, or None when the
    invoice is missing, owned by someone else, or the file has disappeared.
    """
    invoice = get_invoice_by_id(invoice_id, user_id)
    if not invoice:
        return None

    absolute_path = _resolve_stored_path(invoice.get("file_path") or "")
    if not absolute_path or not os.path.isfile(absolute_path):
        return None

    return {
        "absolute_path": absolute_path,
        "mime_type": invoice.get("mime_type") or "application/octet-stream",
        # Serve the user's original file name in the download dialog. It is
        # sanitized with basename so no path fragments can leak into headers.
        "download_name": invoice.get("original_filename") or os.path.basename(absolute_path),
        "file_size": invoice.get("file_size") or os.path.getsize(absolute_path)
    }


# ── DELETE ───────────────────────────────────────────────────────────────────

def delete_invoice(invoice_id: int, user_id: int) -> dict:
    """
    Deletes an owned invoice record AND its stored file from disk.
    The ownership check makes cross-user deletion impossible.
    """
    invoice = get_invoice_by_id(invoice_id, user_id)
    if not invoice:
        return {"success": False, "error": "Invoice not found or access denied."}

    absolute_path = _resolve_stored_path(invoice.get("file_path") or "")
    if absolute_path and os.path.isfile(absolute_path):
        try:
            os.remove(absolute_path)
        except OSError:
            # File already gone or locked: the DB row is still removed below.
            pass

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM Invoices WHERE invoice_id = ?",
            (invoice_id,)
        )
        conn.commit()
        return {"success": True, "message": "Invoice deleted successfully."}
    except Exception as db_error:
        return {"success": False, "error": f"Deletion failed: {str(db_error)}"}
    finally:
        conn.close()
