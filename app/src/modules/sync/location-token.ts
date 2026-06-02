/**
 * P05 — per-location GHL access-token provider for the sync engine.
 *
 * The engine's `on` write-mode needs a usable GHL access token for the TARGET location.
 * Rather than re-architect auth, this REUSES the identity module's existing pieces:
 *   - `accessTokenService.getTokenByLocation` — the ENCRYPTED stored token row.
 *   - `cryptoService.decrypt`                 — decrypt to the `{ access_token, refresh_token }`.
 *   - `ghlTokenService.renewAuthToken`        — refresh-token grant when expired.
 *   - `accessTokenService.updateToken`        — persist the re-encrypted renewed token.
 * This mirrors the renew-if-expired pattern in `identity/controller.ts` (login flow),
 * minus the JWT/timezone concerns (not needed for a server-side writer).
 *
 * SAFETY:
 *   - Raw tokens are NEVER logged. Only the location id + outcome are logged.
 *   - Returns `null` (never throws) when no token row exists or renew fails, so the
 *     caller (dispatch `on` mode) degrades to its existing no-token guard (refuses the
 *     live write) instead of crashing the engine loop.
 *   - In-memory cache with a short TTL avoids a renew round-trip per write. Cache holds
 *     the decoded access token only; it is dropped on TTL expiry.
 */

import { cryptoService } from '../../utils/crypto.js';
import { accessTokenService, ghlTokenService } from '../identity/services.js';
import type { Token } from '../identity/types.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-location-token' });

/** Cache TTL for a resolved access token. Short — JWTs/access tokens are long-lived
 *  relative to this, so the window only collapses bursts of writes for one location. */
const TOKEN_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  token: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test-only: clear the in-memory token cache. */
export function __clearLocationTokenCache(): void {
  cache.clear();
}

/**
 * Decrypt the stored token row's `token` (hex) into the GHL token object.
 * Returns null on any decrypt/parse failure (never throws).
 */
function decodeStored(tokenHex: string): Token | null {
  try {
    const buf = Buffer.from(tokenHex, 'hex');
    const json = cryptoService.decrypt(buf);
    return JSON.parse(json) as Token;
  } catch (e) {
    log.error({ err: (e as Error).message }, 'failed to decrypt/parse stored token');
    return null;
  }
}

/**
 * Resolve a usable GHL access token for `locationId`, reusing identity services.
 *
 * Always renews via the refresh-token grant (matching the login flow's default action)
 * and persists the renewed encrypted token, so the engine never sends an expired token.
 * On any failure returns null — caller treats null exactly like "no token" (no live write).
 */
export async function getLocationAccessToken(locationId: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(locationId);
  if (cached && cached.expiresAt > now) {
    return cached.token;
  }

  const row = await accessTokenService.getTokenByLocation(locationId);
  if (!row || !row.token) {
    log.warn({ locationId }, 'no stored token row for location — cannot resolve access token');
    return null;
  }

  const decoded = decodeStored(row.token);
  if (!decoded || !decoded.refresh_token) {
    log.error({ locationId }, 'stored token undecodable or missing refresh_token');
    return null;
  }

  // Renew via refresh-token grant (same default action as the login flow).
  const renewed = await ghlTokenService.renewAuthToken(decoded.refresh_token);
  if (!renewed || renewed.status < 0 || renewed.status >= 400 || !renewed.data?.access_token) {
    log.error({ locationId, status: renewed?.status }, 'token renew failed — no usable access token');
    return null;
  }

  // Persist the re-encrypted renewed token so the next session starts from a fresh refresh
  // token (refresh tokens rotate). Best-effort: a persist failure must not block the write.
  try {
    const encToken = cryptoService.encrypt(JSON.stringify(renewed.data));
    await accessTokenService.updateToken({
      company: row.company,
      location: row.location,
      name: row.name,
      calendar: row.calendar,
      timezone: row.timezone,
      secret: row.secret,
      token: encToken,
      pushGHL: row.pushGHL || false,
      pushAppt: row.pushAppt || false,
      pushPat: row.pushPat || false,
      software: row.software,
    });
  } catch (e) {
    log.error({ locationId, err: (e as Error).message }, 'failed to persist renewed token (continuing)');
  }

  const accessToken = renewed.data.access_token as string;
  cache.set(locationId, { token: accessToken, expiresAt: now + TOKEN_TTL_MS });
  log.info({ locationId }, 'resolved per-location GHL access token (renewed)');
  return accessToken;
}
