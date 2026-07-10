/**
 * EDGE-02 — Titanium Edge REST `/api/*` HTTP client (ECLI-01/02/03).
 *
 * Transport layer for later Edge modules (EDGE-03/04/05). Dark/additive:
 * nothing in existing sync/EHR/GHL/webhook paths calls this yet.
 *
 * - X-API-Key: olx_... auth (D-02). Token is a per-call argument, NEVER
 *   stored in module state.
 * - Routes through fetchWithBackoff (429/5xx capped backoff, Retry-After).
 * - `/api/*`-only guard throws before any network call (ECLI-03).
 * - pino-logged only — no console.* (GHL client's console.log debt not copied).
 * - On the 2nd+ consecutive 401/403 for a location, fires the sync engine's
 *   existing oauth_failure alert and still surfaces (does not swallow) the
 *   failing response.
 */
import { config } from '../../config.js';
import { fetchWithBackoff, safeJsonParse, type FetchWithBackoffOptions } from '../../utils/fetch.js';
import { triggerAlert } from '../sync/alerts.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'edge-client' });

const EDGE_API_URL = config.edge.apiUrl;

export interface EdgeFetchContext {
  token: string;
  locationId?: string;
}

export interface EdgeFetchResult {
  status: number;
  data: unknown;
}

/** Consecutive-401/403 counter per locationId. Reset on any non-401/403 response. */
const consecutiveAuthFailures = new Map<string, number>();

export const edgeHeaders = (token: string, includeContentType = true): Record<string, string> => {
  const headers: Record<string, string> = {
    'X-API-Key': token,
  };
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

function assertApiPath(path: string): void {
  if (!path.startsWith('/api/')) {
    throw new Error(`edgeFetch: refusing non-/api/* path: ${path}`);
  }
}

async function handleAuthTracking(status: number, locationId: string | undefined): Promise<void> {
  const key = locationId || 'unknown';
  if (status === 401 || status === 403) {
    const count = (consecutiveAuthFailures.get(key) || 0) + 1;
    consecutiveAuthFailures.set(key, count);
    if (count >= 2) {
      log.error({ locationId: key, status, consecutiveFailures: count }, 'edge: repeated auth failure');
      await triggerAlert('oauth_failure', { system: 'edge', locationId: key }).catch(() => undefined);
    }
    return;
  }
  consecutiveAuthFailures.delete(key);
}

/**
 * Fetch a Titanium Edge `/api/*` path with olx_ auth, 429/5xx backoff, and
 * 401/403 alerting. Throws synchronously (before any network call) if `path`
 * does not start with `/api/`.
 */
export const edgeFetch = async (
  path: string,
  opts: RequestInit & Partial<FetchWithBackoffOptions> = {},
  ctx: EdgeFetchContext,
): Promise<EdgeFetchResult> => {
  assertApiPath(path);

  const url = `${EDGE_API_URL}${path}`;
  const { token, locationId } = ctx;
  const includeContentType = !!opts.body;

  const resp = await fetchWithBackoff(url, {
    ...opts,
    headers: {
      ...edgeHeaders(token, includeContentType),
      ...(opts.headers as Record<string, string> | undefined),
    },
  });

  const dataStr = await resp.text();
  await handleAuthTracking(resp.status, locationId);

  if (resp.status >= 200 && resp.status < 300) {
    log.info({ path, status: resp.status }, 'edge request ok');
    return { status: resp.status, data: safeJsonParse(dataStr) };
  }

  log.warn({ path, status: resp.status }, 'edge request failed');
  return { status: resp.status, data: safeJsonParse(dataStr) ?? dataStr };
};

/**
 * Lightweight connectivity probe against a documented `/api/*` route
 * (read-only, demo tenant). No documented dedicated health/ping route in
 * research/edge-integration.md's OpenAPI survey, so this uses a minimal
 * authenticated GET on the contacts list with limit=1 purely as a
 * connectivity check — not a business method.
 */
export const edgeHealthCheck = async (
  token: string,
  locationId?: string,
): Promise<{ ok: boolean; status: number }> => {
  const { status } = await edgeFetch('/api/contacts?limit=1', { method: 'GET' }, { token, locationId });
  return { ok: status >= 200 && status < 300, status };
};
