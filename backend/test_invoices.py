"""
test_invoices.py - Invoice Upload Test Suite for Vaultly (Member 2).
Covers upload validation, size limits, magic-byte content checks, path-traversal
protection, ownership enforcement, downloads, and deletion.
Run with: python3 backend/test_invoices.py
"""

import os
import sys
import base64
import tempfile

# Set test environment to use an isolated temporary database
test_db_file = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
test_db_path = test_db_file.name
test_db_file.close()

import database
database.DB_PATH = test_db_path
database.DB_DIR = os.path.dirname(test_db_path)

from database import initialize_database, get_connection
from auth import register_user, login_user
from products import add_product

# invoices.py must be imported AFTER the database path is patched
from invoices import (
    upload_invoice,
    get_invoice_by_id,
    get_all_invoices,
    get_invoices_for_product,
    get_invoice_file,
    delete_invoice,
    ensure_invoice_schema
)

# Isolate uploads inside a temporary directory so tests never touch real data
invoices_module = sys.modules["invoices"]
invoices_module.UPLOAD_DIR = tempfile.mkdtemp(prefix="vaultly_uploads_test_")

initialize_database()
ensure_invoice_schema()

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
print(" RUNNING VAULTLY MEMBER 2 TEST SUITE (Invoices)")
print("=======================================================\n")

# ── SETUP: two users, one product each ──────────────────────────────────────
reg1 = register_user("Alice Sharma", "alice@example.com", "mypassword123", "mypassword123")
reg2 = register_user("Bob Verma", "bob@example.com", "bobpassword1", "bobpassword1")
user1_id = reg1.get("user_id")
user2_id = reg2.get("user_id")

prod1 = add_product(user1_id, {"name": "Sony Headphones", "price": 29990.0, "purchase_date": "2026-01-10"})
prod2 = add_product(user2_id, {"name": "Dell Monitor", "price": 12000.0, "purchase_date": "2026-02-01"})
product1_id = prod1.get("product_id")
product2_id = prod2.get("product_id")

# Genuine file signatures for testing
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
PDF_BYTES = b"%PDF-1.4\n" + b"1 0 obj << /Type /Catalog >> endobj\n" * 5

# ── 1. VALID UPLOADS ────────────────────────────────────────────────────────
print("1. Valid Upload Tests:")

upload_png = upload_invoice(product1_id, user1_id, {
    "file_name": "receipt photo.PNG",
    "file_data": base64.b64encode(PNG_BYTES).decode("ascii"),
    "invoice_number": "INV-2026-001",
    "seller": "Amazon",
    "invoice_date": "2026-01-10"
})
assert_test("Valid PNG upload succeeds", upload_png.get("success") is True, str(upload_png))

png_invoice = upload_png.get("invoice") or {}
assert_test("Original file name preserved for display",
            png_invoice.get("original_filename") == "receipt photo.PNG", str(png_invoice))
assert_test("Server-verified MIME type stored",
            png_invoice.get("mime_type") == "image/png", str(png_invoice))
assert_test("Stored size matches decoded bytes",
            png_invoice.get("file_size") == len(PNG_BYTES), str(png_invoice))

upload_pdf = upload_invoice(product1_id, user1_id, {
    "file_name": "invoice.pdf",
    "file_data": base64.b64encode(PDF_BYTES).decode("ascii")
})
assert_test("Valid PDF upload succeeds", upload_pdf.get("success") is True, str(upload_pdf))

# File physically exists inside uploads/u{user_id}/ with a generated name
stored_path = os.path.join(invoices_module.UPLOAD_DIR, png_invoice.get("file_path") or "missing")
assert_test("File saved inside the user's uploads directory", os.path.isfile(stored_path), stored_path)
stored_name = os.path.basename(stored_path)
assert_test("Stored name is server-generated (not user-controlled)",
            stored_name.startswith("invoice_u") and stored_name.endswith(".png"), stored_name)

# ── 2. INVALID FILES REJECTED ───────────────────────────────────────────────
print("\n2. Invalid File Tests:")

upload_txt = upload_invoice(product1_id, user1_id, {
    "file_name": "notes.txt",
    "file_data": base64.b64encode(b"just text").decode("ascii")
})
assert_test("Unsupported extension (.txt) rejected", upload_txt.get("success") is False)

upload_exe = upload_invoice(product1_id, user1_id, {
    "file_name": "malware.exe",
    "file_data": base64.b64encode(b"MZ\x90\x00").decode("ascii")
})
assert_test("Executable extension (.exe) rejected", upload_exe.get("success") is False)

upload_empty = upload_invoice(product1_id, user1_id, {
    "file_name": "empty.png",
    "file_data": ""
})
assert_test("Empty file rejected", upload_empty.get("success") is False)

upload_noext = upload_invoice(product1_id, user1_id, {
    "file_name": "nofield",
    "file_data": base64.b64encode(PNG_BYTES).decode("ascii")
})
assert_test("File without extension rejected", upload_noext.get("success") is False)

# ── 3. CONTENT vs NAME MISMATCH ─────────────────────────────────────────────
print("\n3. Magic-Byte Content Verification Tests:")

fake_pdf = upload_invoice(product1_id, user1_id, {
    "file_name": "fake.pdf",
    "file_data": base64.b64encode(b"This is definitely not a PDF").decode("ascii")
})
assert_test("Text renamed to .pdf rejected by magic-byte check",
            fake_pdf.get("success") is False, str(fake_pdf))

fake_png = upload_invoice(product1_id, user1_id, {
    "file_name": "fake.png",
    "file_data": base64.b64encode(b"\xff\xd8\xff" + b"jpeg bytes").decode("ascii")
})
assert_test("JPEG bytes renamed to .png rejected by magic-byte check",
            fake_png.get("success") is False, str(fake_png))

# ── 4. SIZE LIMIT (5 MB) ────────────────────────────────────────────────────
print("\n4. Size Limit Tests:")

oversized_png = PNG_BYTES + b"\x00" * (6 * 1024 * 1024)
upload_big = upload_invoice(product1_id, user1_id, {
    "file_name": "huge.png",
    "file_data": base64.b64encode(oversized_png).decode("ascii")
})
assert_test("6 MB file rejected (5 MB limit)", upload_big.get("success") is False, str(upload_big))

# Just under the limit must pass: PNG header + 4 MB of zeros
small_png = PNG_BYTES + b"\x00" * (4 * 1024 * 1024)
upload_4mb = upload_invoice(product1_id, user1_id, {
    "file_name": "four_mb.png",
    "file_data": base64.b64encode(small_png).decode("ascii")
})
assert_test("4 MB file accepted", upload_4mb.get("success") is True, str(upload_4mb))

# ── 5. CORRUPTED BASE64 ─────────────────────────────────────────────────────
print("\n5. Corrupted Data Tests:")

upload_corrupt = upload_invoice(product1_id, user1_id, {
    "file_name": "corrupt.png",
    "file_data": "!!!not-base64!!!"
})
assert_test("Malformed Base64 rejected with clear error",
            upload_corrupt.get("success") is False, str(upload_corrupt))

# ── 6. PATH TRAVERSAL PROTECTION ────────────────────────────────────────────
print("\n6. Path Traversal Tests:")

traversal_attempt = upload_invoice(product1_id, user1_id, {
    "file_name": "../../database/vaultly.db",
    "file_data": base64.b64encode(PDF_BYTES).decode("ascii")
})
assert_test("Traversal path rejected (.db not whitelisted)",
            traversal_attempt.get("success") is False, str(traversal_attempt))

traversal_pdf = upload_invoice(product1_id, user1_id, {
    "file_name": "../../../etc/passwd.pdf",
    "file_data": base64.b64encode(PDF_BYTES).decode("ascii")
})
assert_test("Traversal name with allowed extension still stored safely",
            traversal_pdf.get("success") is True, str(traversal_pdf))

traversal_invoice = traversal_pdf.get("invoice") or {}
assert_test("Only the basename is stored as original filename",
            traversal_invoice.get("original_filename") == "passwd.pdf", str(traversal_invoice))
stored_file_path = traversal_invoice.get("file_path") or ""
assert_test("Stored file_path never leaves the uploads directory",
            stored_file_path.startswith(f"u{user1_id}/invoice_u"), stored_file_path)
db_path_untouched = get_connection()
users_row_count = db_path_untouched.execute("SELECT COUNT(*) AS c FROM Users").fetchone()["c"]
db_path_untouched.close()
assert_test("Database file was not overwritten by traversal attempt", users_row_count == 2)

# ── 7. OWNERSHIP ENFORCEMENT ────────────────────────────────────────────────
print("\n7. Ownership & Cross-User Security Tests:")

cross_upload = upload_invoice(product1_id, user2_id, {
    "file_name": "hijack.pdf",
    "file_data": base64.b64encode(PDF_BYTES).decode("ascii")
})
assert_test("User 2 cannot upload to User 1's product",
            cross_upload.get("success") is False, str(cross_upload))

invoice1_id = upload_png.get("invoice_id")
cross_read = get_invoice_by_id(invoice1_id, user2_id)
assert_test("User 2 cannot read User 1's invoice", cross_read is None)

cross_download = get_invoice_file(invoice1_id, user2_id)
assert_test("User 2 cannot download User 1's invoice file", cross_download is None)

own_download = get_invoice_file(invoice1_id, user1_id)
assert_test("Owner can download their own invoice", own_download is not None)
assert_test("Download path resolves inside the uploads directory",
            own_download is not None and
            own_download["absolute_path"].startswith(invoices_module.UPLOAD_DIR + os.sep))

cross_delete = delete_invoice(invoice1_id, user2_id)
assert_test("User 2 cannot delete User 1's invoice", cross_delete.get("success") is False)

# ── 8. LISTING & DSA MERGE SORT ─────────────────────────────────────────────
print("\n8. Listing & Merge Sort Tests:")

all_user1 = get_all_invoices(user1_id)
assert_test("User 1 sees only their own invoices",
            all(len({inv["file_path"].split(os.sep)[0]}) == 1 and
                inv["file_path"].startswith(f"u{user1_id}/") for inv in all_user1))

product_list = get_invoices_for_product(product1_id, user1_id)
dates = [inv.get("uploaded_at") or "" for inv in product_list]
assert_test("Invoices sorted newest-first by Merge Sort", dates == sorted(dates, reverse=True), str(dates))

# ── 9. DELETION ─────────────────────────────────────────────────────────────
print("\n9. Deletion Tests:")

delete_result = delete_invoice(invoice1_id, user1_id)
assert_test("Owner can delete their invoice", delete_result.get("success") is True, str(delete_result))
assert_test("Stored file removed from disk", not os.path.isfile(stored_path))

still_there = get_invoice_by_id(invoice1_id, user1_id)
assert_test("Deleted invoice no longer in database", still_there is None)

print("\n=======================================================")
print(f" MEMBER 2 TEST RESULTS: {passed_count} passed, {failed_count} failed")
print("=======================================================\n")

sys.exit(0 if failed_count == 0 else 1)
