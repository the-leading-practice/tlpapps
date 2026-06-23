/**
 * Session identity derived from the GHL-SSO-minted TLP JWT (localStorage.tlp_token).
 *
 * The admin panel authenticates via GHL SSO (POST /api/crm/sso → JWT stored as
 * `tlp_token`), NOT Supabase. The JWT payload is location-scoped and carries:
 *   { location, calendar, timezone, name, software, pushGHL, pushAppt, pushPat }
 * There is no per-user email/avatar in this model — identity is the practice
 * (location). This helper decodes that payload client-side for display only
 * (the server re-verifies the signature on every request; we never trust this
 * for auth decisions).
 */

export interface TlpSession {
  location: string;
  calendar: string;
  timezone: string;
  name: string;
  software: string;
  pushGHL: boolean;
  pushAppt: boolean;
  pushPat: boolean;
  exp?: number;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('tlp_token');
}

/** Decode the stored JWT into a display session, or null if missing/invalid/expired. */
export function getSession(): TlpSession | null {
  const token = getToken();
  if (!token) return null;
  const p = decodeJwtPayload(token);
  if (!p) return null;
  if (typeof p.exp === 'number' && p.exp * 1000 < Date.now()) return null;
  return {
    location: String(p.location ?? ''),
    calendar: String(p.calendar ?? ''),
    timezone: String(p.timezone ?? ''),
    name: String(p.name ?? ''),
    software: String(p.software ?? ''),
    pushGHL: Boolean(p.pushGHL),
    pushAppt: Boolean(p.pushAppt),
    pushPat: Boolean(p.pushPat),
    exp: typeof p.exp === 'number' ? p.exp : undefined,
  };
}

/** Human display name for the signed-in session (practice name → location → fallback). */
export function sessionDisplayName(s: TlpSession | null): string {
  if (!s) return 'Not signed in';
  return s.name || s.location || 'Unknown practice';
}
