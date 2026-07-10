/**
 * P14 T04 — Location allowlist: last-line-of-defense write safety guard.
 *
 * EDGE-10 Plan 03 (ECUT-03, Option B): the single allowlist is split into TWO
 * per-destination buckets:
 *   - 'ghl'  (covers ghl + drchrono legs) — env `SYNC_WRITE_LOCATION_ALLOWLIST`
 *     base, MINUS a DB deny-row overlay. When the DB overlay is EMPTY (the
 *     normal state) this is byte-identical to the pre-ECUT-03 env-only
 *     behavior: empty/absent env denies all, FORBIDDEN_LOCATION_IDS honored.
 *   - 'edge' — NEW. DB allow-row overlay, OR (when the overlay has zero rows)
 *     env `SYNC_WRITE_EDGE_LOCATION_ALLOWLIST` fallback. Absent -> DENY
 *     (fail-closed).
 *
 * `isLocationAllowed(locationId, destination, env?)` — `destination` is a
 * REQUIRED positional argument (no default). This is a deliberate fail-LOUD
 * signature change: every legacy 2-arg/1-arg call site becomes a tsc error
 * until explicitly migrated to pass 'ghl' or 'edge' — see EDGE-10-03-PLAN-CHECK
 * finding A/T-EDGE10-13. This closes off any silent misbind of the old `env`
 * positional into the new `destination` slot.
 *
 * The function stays SYNCHRONOUS. The DB overlay is read into an in-memory
 * snapshot with a 5s TTL + LISTEN 'sync_write_allowlist_changed' invalidation
 * (mirrors writeModeForEntity in dispatch.ts), refreshed lazily in the
 * background — the hot path never awaits. A COLD/empty snapshot means:
 *   - GHL bucket: no deny rows -> pure env behavior (byte-identical, safe).
 *   - Edge bucket: no allow rows -> deny-all (fail-closed, safe).
 *
 * FORBIDDEN real-practice IDs — these must physically never receive a live
 * write regardless of toggle state or destination. Hard-denied even if
 * someone accidentally adds them to an allowlist:
 *
 *   Xcfa7iOs2FvSeKfZYNH6  VxFq5nTOb30N6xL7WWxK  rJWyMhbBrSU2ALEz9WSA
 *   UYDBkM1maZKlp0wjxxuq  aMQwuqsJGkb6WppeWNLi
 */

import { logger } from '../../../logger.js';

const log = logger.child({ module: 'sync-allowlist' });

export type AllowlistDestination = 'ghl' | 'edge';

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
 * Parse a comma-separated env var, strip forbidden IDs, and return the
 * effective set. Returns `null` when the raw value is absent/empty — callers
 * treat `null` as DENY-ALL (fail-closed) for the GHL bucket, and as "no
 * fallback" for the Edge bucket.
 */
function parseIdList(raw: string | undefined): ReadonlySet<string> | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  const ids = trimmed
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
      'allowlist env contains forbidden real-practice IDs — removing them. ' +
        'These IDs will never receive a live sync write.',
    );
  }

  return new Set(safe);
}

/**
 * Parse SYNC_WRITE_LOCATION_ALLOWLIST from env, strip forbidden IDs, and return
 * the effective GHL-bucket base allowlist.  Returns `null` when the env var is
 * absent or empty — callers treat `null` as DENY-ALL (fail-closed).
 *
 * PRESERVED for backwards compatibility (routes.ts display, other callers) —
 * do NOT change its return contract.
 */
export function buildAllowlist(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> | null {
  return parseIdList(env.SYNC_WRITE_LOCATION_ALLOWLIST);
}

/**
 * Parse SYNC_WRITE_EDGE_LOCATION_ALLOWLIST from env, strip forbidden IDs.
 * `null` = absent/empty (no env fallback for the Edge bucket).
 */
export function buildEdgeEnvAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> | null {
  return parseIdList(env.SYNC_WRITE_EDGE_LOCATION_ALLOWLIST);
}

/**
 * @deprecated Use `buildAllowlist` directly. Kept for tests that call initAllowlist
 * explicitly; the cached fields below are no longer used by isLocationAllowed.
 */
export function initAllowlist(env: NodeJS.ProcessEnv = process.env): void {
  // No-op: allowlist is now re-evaluated per-call. Retained for test API compat.
  void env;
}

// ---------------------------------------------------------------------------
// Pure core resolver — deterministic, no DB, no env I/O. Takes explicit Sets
// so it is trivially testable and reusable by both the sync isLocationAllowed
// (env + snapshot) and any future caller that already has the Sets in hand.
// ---------------------------------------------------------------------------

export interface ResolveAllowedInput {
  /** GHL env-list base for the GHL bucket (null = env unset/empty). */
  ghlEnv: ReadonlySet<string> | null;
  /** Edge env-list fallback, used only when edgeAllowed has zero rows. */
  edgeEnv: ReadonlySet<string> | null;
  /** DB deny-rows for destination='ghl' — SUBTRACTED from ghlEnv. */
  ghlDenied: ReadonlySet<string>;
  /** DB allow-rows for destination='edge' — the Edge bucket's primary source. */
  edgeAllowed: ReadonlySet<string>;
}

/**
 * Pure resolver implementing the per-destination allowlist rules. Forbidden
 * IDs are hard-blocked first, for both destinations, always.
 */
export function resolveAllowed(
  locationId: string,
  destination: AllowlistDestination,
  input: ResolveAllowedInput,
): boolean {
  if (FORBIDDEN_LOCATION_IDS.has(locationId)) {
    return false;
  }

  if (destination === 'ghl') {
    // GHL bucket: env-base minus DB deny overlay. Empty overlay => byte-identical
    // to legacy env-only behavior (null env => deny-all).
    if (input.ghlEnv === null) return false;
    if (!input.ghlEnv.has(locationId)) return false;
    if (input.ghlDenied.has(locationId)) return false;
    return true;
  }

  // Edge bucket: DB allow-row wins. When the overlay has ZERO rows at all,
  // fall back to the env fallback list. Absent both => deny (fail-closed).
  if (input.edgeAllowed.size > 0) {
    return input.edgeAllowed.has(locationId);
  }
  if (input.edgeEnv === null) return false;
  return input.edgeEnv.has(locationId);
}

// ---------------------------------------------------------------------------
// DB-backed overlay cache (mirrors writeModeForEntity in dispatch.ts) — 5s TTL
// + LISTEN 'sync_write_allowlist_changed' invalidation. Synchronous reads use
// the last snapshot; never blocks/awaits on the isLocationAllowed hot path.
// ---------------------------------------------------------------------------

type OverlaySnapshot = {
  ghlDenied: ReadonlySet<string>;
  edgeAllowed: ReadonlySet<string>;
};

const EMPTY_SNAPSHOT: OverlaySnapshot = { ghlDenied: new Set(), edgeAllowed: new Set() };

let overlaySnapshot: OverlaySnapshot = EMPTY_SNAPSHOT;
let snapshotExpiresAt = 0;
let refreshInFlight: Promise<void> | null = null;
let listenerInitialized = false;

/** Test-only: force the overlay snapshot without touching the DB. */
export function _setAllowlistOverlayForTests(
  ghlDenied: Iterable<string>,
  edgeAllowed: Iterable<string>,
): void {
  overlaySnapshot = { ghlDenied: new Set(ghlDenied), edgeAllowed: new Set(edgeAllowed) };
  snapshotExpiresAt = Date.now() + 5_000;
}

/** Invalidate the in-process overlay snapshot (used by cutover.ts + tests). */
export function invalidateAllowlistCache(): void {
  overlaySnapshot = EMPTY_SNAPSHOT;
  snapshotExpiresAt = 0;
}

/** Lazily start a LISTEN subscriber for sync_write_allowlist_changed. */
async function ensureAllowlistListener(): Promise<void> {
  if (listenerInitialized) return;
  listenerInitialized = true;
  try {
    const { sql: pgSql } = await import('../../../db/pg/client.js');
    await pgSql.listen('sync_write_allowlist_changed', () => {
      invalidateAllowlistCache();
    });
  } catch (err) {
    log.warn({ err }, 'allowlist: LISTEN/NOTIFY setup failed; using TTL fallback');
  }
}

/**
 * Background (never awaited by the hot path) refresh of the overlay snapshot.
 * On any DB error the snapshot is left as-is (or empty if it was never
 * populated) — both cold states are safe (GHL byte-identical, Edge deny-all).
 */
async function refreshAllowlistOverlay(): Promise<void> {
  try {
    const { db } = await import('../../../db/pg/client.js');
    const { syncWriteAllowlist } = await import('../../../db/pg/schema/sync.js');
    const rows = await db.select().from(syncWriteAllowlist);

    const ghlDenied = new Set<string>();
    const edgeAllowed = new Set<string>();
    for (const row of rows) {
      if (row.destination === 'ghl' && row.allowed === false) {
        ghlDenied.add(row.locationId);
      } else if (row.destination === 'edge' && row.allowed === true) {
        edgeAllowed.add(row.locationId);
      }
    }

    overlaySnapshot = { ghlDenied, edgeAllowed };
    snapshotExpiresAt = Date.now() + 5_000;
  } catch (err) {
    log.warn({ err }, 'allowlist: overlay refresh failed; keeping last snapshot');
  }
}

/** Kick a background refresh (fire-and-forget) if the snapshot is stale. */
function maybeRefreshOverlay(): void {
  if (Date.now() < snapshotExpiresAt) return;
  if (refreshInFlight) return;
  ensureAllowlistListener().catch(() => undefined);
  refreshInFlight = refreshAllowlistOverlay().finally(() => {
    refreshInFlight = null;
  });
}

/**
 * Returns `true` if the given location is allowed to receive a live write to
 * `destination`.
 *
 * Decision tree (fail-CLOSED, both destinations):
 *   1. Always false for null / undefined / empty locationId.
 *   2. Always false for FORBIDDEN_LOCATION_IDS (hard block).
 *   3. 'ghl': env-list base (null env => deny-all) MINUS DB deny-row overlay.
 *   4. 'edge': DB allow-row overlay if non-empty, else env fallback list;
 *      absent both => deny-all.
 *
 * SYNCHRONOUS — never awaits. The DB overlay snapshot is read from the last
 * in-memory refresh; a background refresh is kicked (fire-and-forget) when
 * stale. `env` keeps its position-3 default so pre-existing synthetic-env test
 * call sites only need to insert the new `destination` arg at position 2.
 *
 * @param locationId   GHL-shaped location ID extracted from the event.
 * @param destination  REQUIRED — 'ghl' (covers ghl + drchrono legs) | 'edge'.
 * @param env          Injected in tests to override process.env.
 */
export function isLocationAllowed(
  locationId: string | null | undefined,
  destination: AllowlistDestination,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!locationId) return false;

  if (FORBIDDEN_LOCATION_IDS.has(locationId)) {
    log.error(
      { locationId, destination },
      'write blocked — locationId is a forbidden real-practice ID',
    );
    return false;
  }

  maybeRefreshOverlay();

  const ghlEnv = buildAllowlist(env);
  const edgeEnv = buildEdgeEnvAllowlist(env);

  return resolveAllowed(locationId, destination, {
    ghlEnv,
    edgeEnv,
    ghlDenied: overlaySnapshot.ghlDenied,
    edgeAllowed: overlaySnapshot.edgeAllowed,
  });
}

/**
 * Test-only: no-op kept for test API compat. Module state is no longer cached,
 * so there is nothing to reset — tests simply pass a fresh env to isLocationAllowed.
 */
export function _resetAllowlistForTests(): void {
  invalidateAllowlistCache();
}
