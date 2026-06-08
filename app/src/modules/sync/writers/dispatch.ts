/**
 * P09 T04 — writer dispatch. Bridges an engine decision to the concrete EHR writer
 * based on the per-direction kill switch.
 *
 * Modes (read per target direction from env):
 *   off    : skip entirely, increment `sync_writes_skipped_off` counter. No writer call.
 *   dry    : log the would-be write intent. No API call. (DEFAULT — defaults stay dry.)
 *   verify : build the REAL outbound write but POST it to a verification SINK instead of
 *            the live EHR. The ONLY outbound HTTP is to the sink — never drchrono.com or
 *            the GHL API. No EHR auth token required.
 *   on     : invoke the real writer (DORMANT until user flips the flag in T06).
 *
 * The `http` and writer fns are injectable so the engine wiring can be unit-tested with
 * mocks (assert: dry => writer never called; on => writer called once).
 */

import { logger } from '../../../logger.js';
import type { SyncSystem } from '../decision.js';
import { syncCounters, type Direction } from '../metrics.js';
import { ghlWrite, type GhlEntity, type GhlVerb, type HttpFn as GhlHttp } from './ghl.js';
import {
  drchronoWrite,
  type DcEntity,
  type DcVerb,
  type HttpFn as DcHttp,
} from './drchrono.js';
import { makeSinkHttp, type VerifyDirection } from './verify-sink.js';

// ---------------------------------------------------------------------------
// Core types + env-only mode resolver (must precede writeModeForEntity)
// ---------------------------------------------------------------------------

export type WriteMode = 'off' | 'dry' | 'verify' | 'on';

/**
 * Resolve the kill-switch mode for a write INTO `target` using only env vars.
 * Use this as a synchronous shim when the DB-backed `writeModeForEntity` is not
 * available (e.g. unit tests without a DB). Engine.ts uses `writeModeForEntity`.
 *
 * @deprecated Prefer `writeModeForEntity` for new code — it reads the DB toggle.
 */
export function writeModeFor(target: SyncSystem, env: NodeJS.ProcessEnv = process.env): WriteMode {
  const v =
    target === 'ghl' ? env.SYNC_WRITE_DRCHRONO_TO_GHL : env.SYNC_WRITE_GHL_TO_DRCHRONO;
  if (v === 'on') return 'on';
  if (v === 'off') return 'off';
  if (v === 'verify') return 'verify';
  return 'dry';
}

// ---------------------------------------------------------------------------
// writeModeForEntity — DB-backed per-(direction × entity) toggle with cache
// ---------------------------------------------------------------------------

type CacheEntry = { mode: WriteMode; expiresAt: number };
const controlCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5_000;

/** Test-only: clear the control mode cache. */
export function invalidateControlCache(): void {
  controlCache.clear();
}

let listenerInitialized = false;

/** Lazily start a LISTEN subscriber for sync_controls_changed channel. */
async function ensureListener(): Promise<void> {
  if (listenerInitialized) return;
  listenerInitialized = true;
  try {
    const { sql: pgSql } = await import('../../../db/pg/client.js');
    await pgSql.listen('sync_controls_changed', () => {
      invalidateControlCache();
    });
  } catch (err) {
    // If LISTEN fails (e.g. unit test env), fall back to TTL-only mode — never crash.
    logger.warn({ err }, 'writeModeForEntity: LISTEN/NOTIFY setup failed; using TTL fallback');
  }
}

/**
 * Async, DB-backed per-(direction × entity) mode resolution with 5s TTL cache.
 * Clamps: effective = min(db_mode, env_ceiling). Fails CLOSED (off/dry) on all
 * error paths — DB unreachable → safe default (writeModeFor env-only shim).
 *
 * @param direction drchrono_to_ghl | ghl_to_drchrono
 * @param entity    patients | appointments
 * @param env       process.env override (injected in tests)
 */
export async function writeModeForEntity(
  direction: Direction,
  entity: 'patients' | 'appointments',
  env: NodeJS.ProcessEnv = process.env,
): Promise<WriteMode> {
  const key = `${direction}:${entity}`;
  const now = Date.now();
  const cached = controlCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.mode;
  }

  // Lazy listener setup (no-op if already running)
  ensureListener().catch(() => undefined);

  // Compute env ceiling
  const envRaw = direction === 'drchrono_to_ghl'
    ? env.SYNC_WRITE_DRCHRONO_TO_GHL
    : env.SYNC_WRITE_GHL_TO_DRCHRONO;
  const ceiling: WriteMode =
    envRaw === 'on' ? 'on' :
    envRaw === 'off' ? 'off' :
    envRaw === 'verify' ? 'verify' :
    'dry';

  try {
    const { db } = await import('../../../db/pg/client.js');
    const { syncControls } = await import('../../../db/pg/schema/sync.js');
    const { eq, and } = await import('drizzle-orm');

    const [row] = await db
      .select({ mode: syncControls.mode })
      .from(syncControls)
      .where(and(eq(syncControls.direction, direction), eq(syncControls.entity, entity)));

    if (!row) {
      // Row missing (pre-migration race) — fall back to env-only
      const fallback = writeModeFor(direction === 'drchrono_to_ghl' ? 'ghl' : 'drchrono', env);
      return fallback;
    }

    // Clamp: effective = min(db_mode, ceiling)
    const modeOrder: Record<WriteMode, number> = { off: 0, dry: 1, verify: 2, on: 3 };
    const dbMode = row.mode as WriteMode;
    const effective: WriteMode =
      modeOrder[dbMode] <= modeOrder[ceiling] ? dbMode : ceiling;

    controlCache.set(key, { mode: effective, expiresAt: now + CACHE_TTL_MS });
    return effective;
  } catch (err) {
    // DB unreachable → fail CLOSED: return env ceiling (already clamped to dry/off by default)
    logger.warn({ err, key }, 'writeModeForEntity: DB query failed; returning env ceiling (fail-closed)');
    return ceiling;
  }
}

const log = logger.child({ module: 'writer-dispatch' });

/**
 * Resolve the verification sink URL: explicit env (config.sync.verifySinkUrl), else the
 * built-in endpoint on this app's own port. Read from process.env lazily (not via the
 * config module) so the dispatch module graph never forces config evaluation at import —
 * keeps it side-effect-free for unit tests that set env after import.
 */
function resolveSinkUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = env.PORT || '8080';
  return env.SYNC_VERIFY_SINK_URL || `http://localhost:${port}/api/sync/verify-sink`;
}

export interface DispatchInput {
  eventId: string;
  target: SyncSystem;
  entity: GhlEntity | DcEntity;
  verb: GhlVerb | DcVerb;
  id?: string;
  body?: Record<string, unknown>;
  /** EHR auth token; required only when mode === 'on'. */
  token?: string;
  /** GHL location id — used to resolve the location's exact suppression-tag spelling
   *  for `on`-mode contact writes. Ignored for off/dry/verify and for drchrono. */
  locationId?: string;
}

export interface DispatchDeps {
  mode?: WriteMode;
  ghlHttp?: GhlHttp;
  dcHttp?: DcHttp;
  retryDelayFactor?: number;
}

export type DispatchOutcome = 'skipped-off' | 'dry-logged' | 'verified' | 'written';

/** In-memory counter for skipped-off writes (surfaced by engine batch logs).
 * @deprecated Use syncCounters from metrics.ts; kept for backwards compat. */
export const counters = { sync_writes_skipped_off: 0 };

/**
 * Dispatch a write according to the kill switch. Returns the outcome. Only `on` calls a
 * writer; `dry`/`off` are side-effect-free w.r.t. the EHR.
 */
export async function dispatchWrite(
  input: DispatchInput,
  deps: DispatchDeps = {},
): Promise<DispatchOutcome> {
  const mode = deps.mode ?? writeModeFor(input.target);
  const op = `${input.target}:${input.entity}:${input.verb}`;

  const direction: Direction =
    input.target === 'ghl' ? 'drchrono_to_ghl' : 'ghl_to_drchrono';

  if (mode === 'off') {
    counters.sync_writes_skipped_off++;
    syncCounters.inc('sync_writes_skipped_off');
    log.info({ op, eventId: input.eventId }, 'write skipped — kill switch off');
    return 'skipped-off';
  }

  if (mode === 'dry') {
    syncCounters.inc('sync_dry_run_actions');
    log.info({ op, eventId: input.eventId, dryRun: true }, 'dry-run: write intent only (no API call)');
    return 'dry-logged';
  }

  // mode === 'verify' — build the REAL write but POST it to the sink, never the EHR.
  // No token is required; writers stamp a placeholder so the payload is fully built.
  const verify = mode === 'verify';
  const sink = verify ? resolveSinkUrl() : undefined;

  if (!verify && !input.token) {
    // mode === 'on' but no token — never attempt an unauthenticated live write. Treat as dry.
    log.error({ op, eventId: input.eventId }, 'write mode on but no token — refusing live write');
    return 'dry-logged';
  }

  const token = input.token ?? '';

  try {
    if (input.target === 'ghl') {
      const verifyDir: VerifyDirection = 'drchrono→ghl';
      const http = verify
        ? makeSinkHttp({ sinkUrl: sink!, direction: verifyDir, eventId: input.eventId, http: deps.ghlHttp })
        : deps.ghlHttp;
      await ghlWrite(
        {
          eventId: input.eventId,
          entity: input.entity as GhlEntity,
          verb: input.verb as GhlVerb,
          token,
          id: input.id,
          body: input.body,
          // Only meaningful in `on` mode (token present); resolves the location's exact
          // suppression-tag spelling. In verify there's no token, so ghlWrite skips the
          // live tag fetch and keeps the env literal — sink stays network-isolated.
          locationId: verify ? undefined : input.locationId,
        },
        http,
        { delayFactor: deps.retryDelayFactor },
      );
    } else {
      const verifyDir: VerifyDirection = 'ghl→drchrono';
      const http = verify
        ? makeSinkHttp({ sinkUrl: sink!, direction: verifyDir, eventId: input.eventId, http: deps.dcHttp })
        : deps.dcHttp;
      await drchronoWrite(
        {
          eventId: input.eventId,
          entity: input.entity as DcEntity,
          verb: input.verb as DcVerb,
          token,
          id: input.id,
          body: input.body,
        },
        http,
        { delayFactor: deps.retryDelayFactor },
      );
    }
  } catch (writeErr) {
    syncCounters.inc('sync_writes_attempted', direction);
    syncCounters.inc('sync_writes_failed', direction);
    throw writeErr;
  }

  if (verify) {
    syncCounters.inc('sync_writes_attempted', direction);
    syncCounters.inc('sync_writes_succeeded', direction);
    log.info({ op, eventId: input.eventId, sink }, 'verify: captured outbound write (no EHR call)');
    return 'verified';
  }
  syncCounters.inc('sync_writes_attempted', direction);
  syncCounters.inc('sync_writes_succeeded', direction);
  log.info({ op, eventId: input.eventId }, 'live write completed');
  return 'written';
}
