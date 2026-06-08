/**
 * P14 T04 — Location allowlist: last-line-of-defense write safety guard.
 *
 * Reads SYNC_WRITE_LOCATION_ALLOWLIST (comma-separated GHL location IDs) from
 * the environment.  A non-empty allowlist means **only** listed locations may
 * receive live (`on`-mode) writes.  If the env var is absent or empty the guard
 * is OPEN (all locations pass), which preserves backwards-compat for test / local
 * environments that have no allowlist configured.
 *
 * FORBIDDEN real-practice IDs — these must physically never receive a live write
 * regardless of toggle state:
 *
 *   Xcfa7iOs2FvSeKfZYNH6  VxFq5nTOb30N6xL7WWxK  rJWyMhbBrSU2ALEz9WSA
 *   UYDBkM1maZKlp0wjxxuq  aMQwuqsJGkb6WppeWNLi
 *
 * If the operator accidentally adds one of these IDs to the allowlist, the module
 * emits a startup error log and REMOVES it from the effective set so no write path
 * can reach a real practice.
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

/** The effective allowlist after forbidden-ID removal; undefined = open (allow all). */
let effectiveAllowlist: ReadonlySet<string> | undefined = undefined;
let initialized = false;

/**
 * Parse SYNC_WRITE_LOCATION_ALLOWLIST from env, strip forbidden IDs with an
 * error log, and cache the result for the lifetime of the process.
 *
 * Called lazily on first `isLocationAllowed()` check, or explicitly in tests via
 * `initAllowlist(env)`.
 */
export function initAllowlist(env: NodeJS.ProcessEnv = process.env): void {
  initialized = true;
  const raw = (env.SYNC_WRITE_LOCATION_ALLOWLIST ?? '').trim();

  if (!raw) {
    // No allowlist configured — open guard (all locations pass).
    effectiveAllowlist = undefined;
    return;
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

  effectiveAllowlist = safe.length > 0 ? new Set(safe) : new Set<string>();
}

/**
 * Returns `true` if the given GHL location is allowed to receive a live write.
 *
 * Decision tree:
 *   1. Always false for FORBIDDEN_LOCATION_IDS (hard block, no env override).
 *   2. If no allowlist configured → true (open guard).
 *   3. If allowlist configured → true only if `locationId` is in the set.
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

  if (!initialized) {
    initAllowlist(env);
  }

  // Open guard — no allowlist configured.
  if (effectiveAllowlist === undefined) return true;

  return effectiveAllowlist.has(locationId);
}

/** Test-only: reset module state so tests can call initAllowlist with fresh env. */
export function _resetAllowlistForTests(): void {
  effectiveAllowlist = undefined;
  initialized = false;
}
