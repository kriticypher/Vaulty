// cookies.js - Minimal cookie helpers built with Node/Express primitives only
// (keeps the dependency list at express + prisma).

export function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return '';
}

export function sessionCookie(token, maxAgeSeconds) {
  // HttpOnly: JavaScript (and XSS) can never read the token.
  // SameSite=Lax: sent on normal navigations & same-site requests; blocks CSRF from third-party sites.
  // Path=/: available to every API endpoint.
  return `vaultly_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

export function clearedSessionCookie() {
  return 'vaultly_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}
