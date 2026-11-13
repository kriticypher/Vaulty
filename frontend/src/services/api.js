/**
 * api.js - Centralized API Service for Vaultly.
 * Handles HTTP requests, Authorization Bearer token injection, and JSON responses.
 */

const API_BASE = 'http://localhost:8000';

function getToken() {
  return localStorage.getItem('vaultly_token') || '';
}

async function request(method, path, body = null) {
  const options = {
    method,
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
    throw new Error(data.error || 'API request failed.');
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
