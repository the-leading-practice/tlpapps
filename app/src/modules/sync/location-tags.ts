/**
 * P05 — per-location GHL tag resolution for the automation-suppression guard.
 *
 * Before a CONTACT write in `on` mode, the writer must use the location's EXACT stored
 * spelling of the suppression tag (else GHL mints a NEW tag and the workflow filter the
 * owner built — keyed to the canonical spelling — won't catch it, so automation fires).
 *
 * This fetches the location's tags via GHL `GET /locations/{id}/tags` (through the
 * `utils/fetch.ts` choke point), runs the pure `resolveSuppressTag`, and caches the
 * RESOLVED tag per location with a short TTL.
 *
 * DEGRADE-SAFE — a contact must NEVER go out untagged:
 *   - configured tag ABSENT from location → WARN (filter can't exist) but use configured
 *     literal (still tagged, matched:false).
 *   - tags fetch FAILS (network/4xx/5xx) → ERROR, fall back to configured literal. Never
 *     throw past here.
 */

import { config } from '../../config.js';
import { fetchJson } from '../../utils/fetch.js';
import { resolveSuppressTag, suppressTag } from './suppression.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-location-tags' });

const TAG_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  tag: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test-only: clear the resolved-tag cache. */
export function __clearLocationTagCache(): void {
  cache.clear();
}

/**
 * Fetch a location's tag spellings via GHL. Injectable for tests (default hits the live
 * endpoint through the fetch choke point). Returns the raw `name` strings, or throws on
 * a non-2xx / network error so the caller can degrade.
 */
export type TagFetch = (locationId: string, token: string) => Promise<string[]>;

const defaultTagFetch: TagFetch = async (locationId, token) => {
  const url = `${config.ghl.apiUrl}/locations/${locationId}/tags`;
  const { status, data } = await fetchJson(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      version: config.ghl.apiVersion,
    },
  });
  if (status < 200 || status >= 300) {
    throw new Error(`tags fetch failed status=${status}`);
  }
  // GHL shape: { tags: [{ name, id }, ...] }
  const tags = (data as { tags?: Array<{ name?: string }> })?.tags ?? [];
  return tags.map((t) => t?.name).filter((n): n is string => typeof n === 'string');
};

/**
 * Resolve the suppression tag for a location to its exact stored spelling.
 * Cached per location (TTL). DEGRADE-SAFE: always returns a usable tag string, never throws.
 */
export async function resolveLocationSuppressTag(
  locationId: string,
  token: string,
  tagFetch: TagFetch = defaultTagFetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const configured = suppressTag(env);
  const now = Date.now();

  const cached = cache.get(locationId);
  if (cached && cached.expiresAt > now) {
    return cached.tag;
  }

  let resolvedTag = configured;
  try {
    const tags = await tagFetch(locationId, token);
    const resolved = resolveSuppressTag(tags, configured);
    resolvedTag = resolved.tag;
    if (!resolved.matched) {
      log.warn(
        { locationId, configured },
        'suppression tag absent from location — workflow filter cannot exist; using configured literal (still tagged)',
      );
    }
  } catch (e) {
    // Degrade safe: keep the configured literal so the contact is STILL tagged.
    log.error(
      { locationId, err: (e as Error).message },
      'location tags fetch failed — falling back to configured suppression literal (contact still tagged)',
    );
    resolvedTag = configured;
  }

  cache.set(locationId, { tag: resolvedTag, expiresAt: now + TAG_TTL_MS });
  return resolvedTag;
}
