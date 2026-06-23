const API_BASE = 'https://tlpapps.theleadingpractice.com/api';

/**
 * Redirect the browser into the GHL SSO handshake, preserving the current path
 * so we land back here afterwards. Used when no token is present or the backend
 * rejects the token (expired / invalid) — i.e. the SSO session needs renewing.
 */
function bounceToSso(): void {
  if (typeof window === 'undefined') return;
  const dest = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/embed?return=${dest}`;
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('tlp_token') : null;

  // No token at all → the SSO handshake never completed (or was cleared).
  // Bounce to /embed instead of firing an empty `Bearer ` that the backend
  // answers with 401, which previously surfaced as a confusing inline error.
  if (!token) {
    bounceToSso();
    throw new Error('Not authenticated — redirecting to sign-in.');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  // 401 (no/empty token server-side) or 403 (expired/invalid signature) →
  // the session is gone; re-run SSO rather than showing a raw error.
  if (res.status === 401 || res.status === 403) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('tlp_token');
    bounceToSso();
    throw new Error('Session expired — redirecting to sign-in.');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `API error: ${res.status}`);
  }
  return res.json();
}

export function apiGet<T = any>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' });
}

export function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPut<T = any>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function apiDelete<T = any>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}
