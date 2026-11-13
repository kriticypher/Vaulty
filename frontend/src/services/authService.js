/**
 * authService.js - Authentication helpers and session storage access.
 */

export const authService = {
  getToken: () => localStorage.getItem('vaultly_token'),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem('vaultly_user') || 'null');
    } catch {
      return null;
    }
  },
  isLoggedIn: () => Boolean(localStorage.getItem('vaultly_token')),
  clearSession: () => {
    localStorage.removeItem('vaultly_token');
    localStorage.removeItem('vaultly_user');
  }
};
