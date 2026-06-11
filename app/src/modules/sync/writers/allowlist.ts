/**
 * P14 T04 — Location allowlist: last-line-of-defense write safety guard.
 *
 * Reads SYNC_WRITE_LOCATION_ALLOWLIST (comma-separated GHL location IDs) from
 * the environment on EVERY call (not cached) so a Coolify env flip takes effect
 * immediately — same behaviour as the mode toggles in dispatch.ts.
 *
 * FAIL-CLOSED default: if the env var is absent or empty, NO location is allowed.
 * A location is allowed ONLY when:
 *   1. SYNC_WRITE_LOCATION_ALLOWLIST is non-empty, AND
 *   2. the location ID appears in that list, AND
 *   3. the location ID is NOT in FORBIDDEN_LOCATION_IDS.
 *
 * FORBIDDEN real-practice IDs — these must physically never receive a live write
 * regardless of toggle state.  They are hard-denied even if someone accidentally
 * adds them to the allowlist:
 *
 *   Xcfa7iOs2FvSeKfZYNH6  VxFq5nTOb30N6xL7WWxK  rJWyMhbBrSU2ALEz9WSA
 *   UYDBkM1maZKlp0wjxxuq  aMQwuqsJGkb6WppeWNLi
 *
 * If the operator accidentally adds one of these IDs to the allowlist, the module
 * emits an error log and the ID remains blocked — it never reaches a live write.
 */

import { logger } from '../../../logger.js';

const log = logger.child({ module: 'sync-allowlist' });

/**
 * Hard-coded set of real-practice GHL location IDs that must NEVER receive a
 * live sync write, ever.  Seeded from the plan's hard-safety-constraints section.
 */
export const FORBIDDEN_LOCATION_IDS: ReadonlySet<string> = new Set([
  'Xcfa7iOs2FvSeKfZYNH6',
  'VxFq5nTOb30N6xL7WWxK',
  'rJWyMhbBrSU2ALEz9WSA',
  'UYDBkM1maZKlp0wjxxuq',
  'aMQwuqsJGkb6WppeWNLi',
]);

/**
 * Parse SYNC_WRITE_LOCATION_ALLOWLIST from env, strip forbidden IDs, and return
 * the effective allowlist.  Returns `null` when the env var is absent or empty —
 * callers treat `null` as DENY-ALL (fail-closed).
 *
 * Called on every `isLocationAllowed()` invocation (no caching) so a Coolify env
 * update takes effect without a restart.  The parse is cheap (string split + Set).
 */
export function buildAllowlist(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> | null {
  const raw = (env.SYNC_WRITE_LOCATION_ALLOWLIST ?? '').trim();

  if (!raw) {
    // No allowlist configured — DENY ALL (fail-closed).
    return null;
  }

  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const forbidden: string[] = [];
  const safe: string[] = [];

  for (const id of ids) {
    if (FORBIDDEN_LOCATION_IDS.has(id)) {
      forbidden.push(id);
    } else {
      safe.push(id);
    }
  }

  if (forbidden.length > 0) {
    log.error(
      { forbiddenIds: forbidden },
      'SYNC_WRITE_LOCATION_ALLOWLIST contains forbidden real-practice IDs — removing them. ' +
        'These IDs will never receive a live sync write.',
    );
  }

  return new Set(safe);
}

/**
 * @deprecated Use `buildAllowlist` directly. Kept for tests that call initAllowlist
 * explicitly; the cached fields below are no longer used by isLocationAllowed.
 */
export function initAllowlist(env: NodeJS.ProcessEnv = process.env): void {
  // No-op: allowlist is now re-evaluated per-call. Retained for test API compat.
  void env;
}

/**
 * Returns `true` if the given GHL location is allowed to receive a live write.
 *
 * Decision tree (fail-CLOSED):
 *   1. Always false for null / undefined / empty locationId.
 *   2. Always false for FORBIDDEN_LOCATION_IDS (hard block, belt-and-suspenders).
 *   3. If SYNC_WRITE_LOCATION_ALLOWLIST is absent or empty → false (DENY ALL).
 *   4. If allowlist configured → true only if `locationId` is in the set AND not forbidden.
 *
 * The allowlist is re-read from env on every call so Coolify env flips take effect
 * immediately without a restart.
 *
 * @param locationId  GHL location ID extracted from the event.
 * @param env         Injected in tests to override process.env.
 */
export function isLocationAllowed(
  locationId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!locationId) return false;

  // Hard block — always, regardless of allowlist.
  if (FORBIDDEN_LOCATION_IDS.has(locationId)) {
    log.error(
      { locationId },
      'write blocked — locationId is a forbidden real-practice ID',
    );
    return false;
  }

  // Re-evaluate allowlist from env on every call (fail-closed: null → deny all).
  const allowlist = buildAllowlist(env);
  if (allowlist === null) {
    // No allowlist configured — DENY ALL (fail-closed default).
    return false;
  }

  return allowlist.has(locationId);
}

/**
 * Test-only: no-op kept for test API compat. Module state is no longer cached,
 * so there is nothing to reset — tests simply pass a fresh env to isLocationAllowed.
 */
export function _resetAllowlistForTests(): void {
  // No-op: no module-level state to reset (allowlist is re-evaluated per call).
}
