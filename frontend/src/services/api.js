/**
 * api.js - Centralized API Service for Vaultly.
 * Handles HTTP requests, Authorization Bearer token injection, and JSON responses.
 */

// API host resolution:
//  • Desktop browser: page is served from http://localhost:5173 → API = localhost:8000.
//  • Android WebView (emulator): page loads from http://10.0.2.2:5173 → 10.0.2.2:8000.
//  • Android WebView (real device with `adb reverse`): page loads from
//    http://localhost:5173 → localhost:8000, forwarded to the laptop.
// Using the page's own host keeps the frontend and backend on the same machine
// in every environment — no hardcoded addresses anywhere.
const API_HOST = (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'localhost';
const API_BASE = `http://${API_HOST}:8000`;

export { API_BASE };

function getToken() {
  return localStorage.getItem('vaultly_token') || '';
}

async function request(method, path, body = null) {
  const options = {
    method,
    credentials: 'include', // send the HttpOnly session cookie on every call
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    // Rich error: callers can inspect .status and .data (e.g. duplicate warnings)
    const error = new Error(data.error || 'API request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),

  // Product listing with search, category, price, and sorting filters
  getProducts: (params = {}) => {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== '' && value !== null && value !== undefined) {
        searchParams.append(key, value);
      }
    }
    const queryString = searchParams.toString();
    return request('GET', `/api/products${queryString ? '?' + queryString : ''}`);
  }
};
