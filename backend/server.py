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

PORT = 8000

def get_bearer_token(handler: BaseHTTPRequestHandler) -> str:
    """Extracts the Bearer token from the HTTP Authorization header."""
    auth_header = handler.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer "):].strip()
    return ""

def read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    """Safely reads and decodes JSON from the incoming HTTP request body."""
    content_length = int(handler.headers.get("Content-Length", 0))
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
