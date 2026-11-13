"""
server.py - Pure Python HTTP Server for Vaultly (Member 1).
Uses only Python standard library: http.server, urllib.parse, json, os.
Zero third-party framework dependencies (no Flask, no Django).
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

from database import initialize_database, get_connection
from auth import (
    register_user,
    login_user,
    logout_user,
    get_user_id_from_token,
    get_user_profile
)
from products import (
    add_product,
    get_all_products,
    get_product_by_id,
    get_product_details,
    update_product,
    delete_product
)
from dashboard import get_dashboard_stats, get_analytics_data
from invoices import (
    ensure_invoice_schema,
    upload_invoice,
    get_all_invoices,
    get_invoices_for_product,
    get_invoice_file,
    delete_invoice
)

PORT = 8000

# Member 2: request-body guard for Base64 JSON uploads.
# 5 MB file -> ~6.99 MB Base64 -> add ~256 KB of JSON overhead as headroom.
MAX_UPLOAD_BODY_BYTES = 7 * 1024 * 1024

def get_bearer_token(handler: BaseHTTPRequestHandler) -> str:
    """Extracts the Bearer token from the HTTP Authorization header."""
    auth_header = handler.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer "):].strip()
    return ""

def read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    """Safely reads and decodes JSON from the incoming HTTP request body."""
    content_length = int(handler.headers.get("Content-Length", 0))

    # Member 2: reject oversized request bodies BEFORE reading them from the
    # socket, so a giant Base64 upload can never consume server memory.
    if content_length > MAX_UPLOAD_BODY_BYTES:
        send_json_response(
            handler, 413,
            {"error": "Upload is too large. Maximum file size is 5 MB."}
        )
        return None

    if content_length == 0:
        return {}
    raw_body = handler.rfile.read(content_length)
    try:
        return json.loads(raw_body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}

def send_json_response(handler: BaseHTTPRequestHandler, status_code: int, payload: dict):
    """Encodes JSON payload and writes standard headers including CORS."""
    response_bytes = json.dumps(payload).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(response_bytes)))

    # Cross-Origin Resource Sharing (CORS) headers for local development with React/Vite
    handler.send_header("Access-Control-Allow-Origin", "http://localhost:5173")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    handler.send_header("Access-Control-Allow-Credentials", "true")
    handler.end_headers()
    handler.wfile.write(response_bytes)

def send_file_response(handler: BaseHTTPRequestHandler, file_info: dict, preview: bool = False):
    """
    Member 2: streams a stored invoice file with strict download security:
    - Content-Type is taken from the server-verified MIME map, never the client.
    - Content-Disposition 'attachment' forces a download dialog instead of
      rendering (a malicious file can never execute in the browser session).
      When preview=True, images/PDFs are served inline only, with nosniff.
    - X-Content-Type-Options: nosniff stops the browser from guessing types.
    """
    file_path = file_info["absolute_path"]
    file_size = file_info["file_size"]
    mime_type = file_info["mime_type"]
    download_name = file_info["download_name"]

    if preview and mime_type in ("image/jpeg", "image/png", "application/pdf"):
        disposition = "inline"
    else:
        disposition = "attachment"

    handler.send_response(200)
    handler.send_header("Content-Type", mime_type)
    handler.send_header("Content-Length", str(file_size))
    handler.send_header(
        "Content-Disposition",
        f'{disposition}; filename="{download_name}"'
    )
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Cache-Control", "private, no-store")

    handler.send_header("Access-Control-Allow-Origin", "http://localhost:5173")
    handler.send_header("Access-Control-Allow-Credentials", "true")
    handler.end_headers()

    # Stream in 64 KB chunks so even large files never load fully into memory.
    with open(file_path, "rb") as file_handle:
        while True:
            chunk = file_handle.read(65536)
            if not chunk:
                break
            handler.wfile.write(chunk)

class VaultlyRequestHandler(BaseHTTPRequestHandler):
    """
    HTTP request dispatcher routing incoming REST API requests to
    corresponding modules (auth, products, dashboard).
    """

    def log_message(self, format_str, *args):
        """Custom logging for academic demonstration."""
        print(f"[{self.command}] {self.path} -> {args[1] if len(args) > 1 else ''}")

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:5173")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.end_headers()

    # ── GET HANDLERS ──────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        query_params = parse_qs(parsed.query)

        # GET /api/products
        if path == "/api/products":
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required. Please login."})

            search = query_params.get("search", [""])[0]
            category = query_params.get("category", [""])[0]
            sort_by = query_params.get("sort_by", [""])[0]

            min_price_str = query_params.get("min_price", [None])[0]
            max_price_str = query_params.get("max_price", [None])[0]

            min_price = float(min_price_str) if min_price_str else None
            max_price = float(max_price_str) if max_price_str else None

            products = get_all_products(
                user_id=user_id,
                search=search,
                category=category,
                min_price=min_price,
                max_price=max_price,
                sort_by=sort_by
            )
            return send_json_response(self, 200, {"products": products})

        # ── Member 2: INVOICE ROUTES (must run before /api/products/{id}) ─────

        # GET /api/invoices  — every invoice owned by the logged-in user
        elif path == "/api/invoices":
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            invoices = get_all_invoices(user_id)
            return send_json_response(self, 200, {"invoices": invoices})

        # GET /api/products/{id}/invoices — invoices linked to one owned product
        elif path.startswith("/api/products/") and path.endswith("/invoices"):
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            try:
                product_id = int(path[len("/api/products/"):].split("/")[0])
            except ValueError:
                return send_json_response(self, 400, {"error": "Invalid product ID format."})

            invoices = get_invoices_for_product(product_id, user_id)
            return send_json_response(self, 200, {"invoices": invoices})

        # GET /api/invoices/{id}/download — stream the stored file
        elif path.startswith("/api/invoices/") and path.endswith("/download"):
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            try:
                invoice_id = int(path[len("/api/invoices/"):].split("/")[0])
            except ValueError:
                return send_json_response(self, 400, {"error": "Invalid invoice ID format."})

            preview = query_params.get("preview", ["0"])[0] == "1"
            file_info = get_invoice_file(invoice_id, user_id)
            if not file_info:
                return send_json_response(self, 404, {"error": "Invoice not found or access denied."})

            return send_file_response(self, file_info, preview=preview)

        # GET /api/products/{id}
        elif path.startswith("/api/products/"):
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            try:
                product_id = int(path.split("/")[-1])
            except ValueError:
                return send_json_response(self, 400, {"error": "Invalid product ID format."})

            details = get_product_details(product_id, user_id)
            if not details:
                return send_json_response(self, 404, {"error": "Product not found or access denied."})

            return send_json_response(self, 200, details)

        # GET /api/dashboard
        elif path == "/api/dashboard":
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            stats = get_dashboard_stats(user_id)
            return send_json_response(self, 200, stats)

        # GET /api/analytics
        elif path == "/api/analytics":
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            analytics = get_analytics_data(user_id)
            return send_json_response(self, 200, analytics)

        # GET /api/me
        elif path == "/api/me":
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            profile = get_user_profile(user_id)
            if not profile:
                return send_json_response(self, 404, {"error": "User profile not found."})

            return send_json_response(self, 200, {"user": profile})

        else:
            return send_json_response(self, 404, {"error": f"Endpoint not found: {path}"})

    # ── POST HANDLERS ─────────────────────────────────────────────────────────
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        data = read_json_body(self)

        # read_json_body already sent a 413 response when the body was oversized.
        if data is None:
            return

        # POST /api/register
        if path == "/api/register":
            name = data.get("name", "")
            email = data.get("email", "")
            password = data.get("password", "")
            confirm = data.get("confirm_password", None)

            result = register_user(name, email, password, confirm)
            status_code = 201 if result.get("success") else 400
            return send_json_response(self, status_code, result)

        # POST /api/login
        elif path == "/api/login":
            email = data.get("email", "")
            password = data.get("password", "")

            result = login_user(email, password)
            status_code = 200 if result.get("success") else 401
            return send_json_response(self, status_code, result)

        # POST /api/logout
        elif path == "/api/logout":
            token = get_bearer_token(self)
            result = logout_user(token)
            return send_json_response(self, 200, result)

        # POST /api/products
        elif path == "/api/products":
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            result = add_product(user_id, data)
            status_code = 201 if result.get("success") else 400
            return send_json_response(self, status_code, result)

        # ── Member 2: POST /api/products/{id}/invoices (Base64 JSON upload) ───
        elif path.startswith("/api/products/") and path.endswith("/invoices"):
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            try:
                product_id = int(path[len("/api/products/"):].split("/")[0])
            except ValueError:
                return send_json_response(self, 400, {"error": "Invalid product ID format."})

            result = upload_invoice(product_id, user_id, data)
            status_code = 201 if result.get("success") else 400
            return send_json_response(self, status_code, result)

        else:
            return send_json_response(self, 404, {"error": f"Endpoint not found: {path}"})

    # ── PUT HANDLERS ──────────────────────────────────────────────────────────
    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        data = read_json_body(self)

        # PUT /api/products/{id}
        if path.startswith("/api/products/"):
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            try:
                product_id = int(path.split("/")[-1])
            except ValueError:
                return send_json_response(self, 400, {"error": "Invalid product ID format."})

            result = update_product(product_id, user_id, data)
            status_code = 200 if result.get("success") else 400
            return send_json_response(self, status_code, result)

        else:
            return send_json_response(self, 404, {"error": f"Endpoint not found: {path}"})

    # ── DELETE HANDLERS ───────────────────────────────────────────────────────
    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        # ── Member 2: DELETE /api/invoices/{id} ──────────────────────────────
        if path.startswith("/api/invoices/"):
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            try:
                invoice_id = int(path.split("/")[-1])
            except ValueError:
                return send_json_response(self, 400, {"error": "Invalid invoice ID format."})

            result = delete_invoice(invoice_id, user_id)
            status_code = 200 if result.get("success") else 404
            return send_json_response(self, status_code, result)

        # DELETE /api/products/{id}
        if path.startswith("/api/products/"):
            token = get_bearer_token(self)
            user_id = get_user_id_from_token(token)
            if not user_id:
                return send_json_response(self, 401, {"error": "Authentication required."})

            try:
                product_id = int(path.split("/")[-1])
            except ValueError:
                return send_json_response(self, 400, {"error": "Invalid product ID format."})

            result = delete_product(product_id, user_id)
            status_code = 200 if result.get("success") else 404
            return send_json_response(self, status_code, result)

        else:
            return send_json_response(self, 404, {"error": f"Endpoint not found: {path}"})

def run_server():
    """Initializes database schema and starts HTTP server on port 8000."""
    initialize_database()
    ensure_invoice_schema()  # Member 2: adds invoice bookkeeping columns safely
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, VaultlyRequestHandler)
    print(f"\n=======================================================")
    print(f" Vaultly Backend Server running on http://localhost:{PORT}")
    print(f" Ready to accept requests from React frontend.")
    print(f"=======================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server gracefully...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
