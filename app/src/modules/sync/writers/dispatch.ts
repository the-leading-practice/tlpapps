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
import { isLocationAllowed } from './allowlist.js';
import { edgeWrite, type EdgeWriteDeps, type EdgeWriteEntity, type EdgeWriteVerb } from './edge.js';
import { buildEdgeCtx } from './edge-ctx.js';
import type { EdgeCtx } from '../../edge/types.js';

// ---------------------------------------------------------------------------
// Core types + env-only mode resolver (must precede writeModeForEntity)
// ---------------------------------------------------------------------------

export type WriteMode = 'off' | 'dry' | 'verify' | 'on';

/**
 * Resolve the env ceiling for a given direction. Single source of truth, reused by
 * both `writeModeForEntity` (DB-backed clamp) and the `/api/sync/controls` route
 * (panel-facing ceiling display + PATCH clamp). drchrono_to_edge / edge_to_drchrono
 * are highest-risk live-write extensions (D-02/D-05) — their unset/garbage env MUST
 * resolve to 'off', NOT the GHL/DrChrono legs' 'dry' default. Fail-closed on any
 * unrecognized value (not just unset).
 */
export function envCeilingForDirection(
  direction: Direction,
  env: NodeJS.ProcessEnv = process.env,
): WriteMode {
  if (direction === 'drchrono_to_edge') {
    const envRaw = env.SYNC_WRITE_EDGE;
    return envRaw === 'on' ? 'on' :
      envRaw === 'verify' ? 'verify' :
      envRaw === 'dry' ? 'dry' :
      'off';
  }
  if (direction === 'edge_to_drchrono') {
    const envRaw = env.SYNC_WRITE_EDGE_TO_DRCHRONO;
    return envRaw === 'on' ? 'on' :
      envRaw === 'verify' ? 'verify' :
      envRaw === 'dry' ? 'dry' :
      'off';
  }
  const envRaw = direction === 'drchrono_to_ghl'
    ? env.SYNC_WRITE_DRCHRONO_TO_GHL
    : env.SYNC_WRITE_GHL_TO_DRCHRONO;
  return envRaw === 'on' ? 'on' :
    envRaw === 'off' ? 'off' :
    envRaw === 'verify' ? 'verify' :
    'dry';
}

/**
 * Resolve the kill-switch mode for a write INTO `target` using only env vars.
 * Use this as a synchronous shim when the DB-backed `writeModeForEntity` is not
 * available (e.g. unit tests without a DB). Engine.ts uses `writeModeForEntity`.
 *
 * @deprecated Prefer `writeModeForEntity` for new code — it reads the DB toggle.
 */
export function writeModeFor(
  target: SyncSystem | 'edge',
  env: NodeJS.ProcessEnv = process.env,
): WriteMode {
  if (target === 'edge') {
    // drchrono_to_edge's unset default is 'off' (D-02) — NOT 'dry' like ghl/drchrono.
    const v = env.SYNC_WRITE_EDGE;
    if (v === 'on') return 'on';
    if (v === 'dry') return 'dry';
    if (v === 'verify') return 'verify';
    return 'off';
  }
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
 * Clamps: effective = min(db_mode, env_ceiling). Fails CLOSED to `off` on ALL
 * error paths — DB unreachable / missing row / cache miss → `'off'` regardless
 * of what the env ceiling says.  The env ceiling is only applied when a confirmed
 * DB row exists.
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

  // Compute env ceiling via the shared resolver (single source of truth — see
  // envCeilingForDirection above). Edge directions fail closed to 'off' on
  // unset/garbage env; GHL/DrChrono legs default to 'dry' (unchanged legacy behavior).
  const ceiling: WriteMode = envCeilingForDirection(direction, env);

  try {
    const { db } = await import('../../../db/pg/client.js');
    const { syncControls } = await import('../../../db/pg/schema/sync.js');
    const { eq, and } = await import('drizzle-orm');

    const [row] = await db
      .select({ mode: syncControls.mode })
      .from(syncControls)
      .where(and(eq(syncControls.direction, direction), eq(syncControls.entity, entity)));

    if (!row) {
      // Row missing (pre-migration race or schema not yet applied) — fail CLOSED.
      logger.warn({ key }, 'writeModeForEntity: no DB row found; returning off (fail-closed)');
      return 'off';
    }

    // Clamp: effective = min(db_mode, ceiling)
    const modeOrder: Record<WriteMode, number> = { off: 0, dry: 1, verify: 2, on: 3 };
    const dbMode = row.mode as WriteMode;
    const effective: WriteMode =
      modeOrder[dbMode] <= modeOrder[ceiling] ? dbMode : ceiling;

    controlCache.set(key, { mode: effective, expiresAt: now + CACHE_TTL_MS });
    return effective;
  } catch (err) {
    // DB unreachable / query error → fail CLOSED to 'off' (safe floor).
    // NEVER return the env ceiling here — a transient DB failure must not escalate
    // a toggled-off/dry row to 'on'.
    logger.warn({ err, key }, 'writeModeForEntity: DB query failed; returning off (fail-closed)');
    return 'off';
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

/** EDGE-06 Plan 03: dispatch target additive union — 'edge' alongside the engine's
 *  ghl/drchrono SyncSystem. Kept as a LOCAL union (not a decision.ts SyncSystem edit)
 *  since 'edge' is never a decision.ts routing target — only an additive dispatch leg. */
export type DispatchTarget = SyncSystem | 'edge';

/**
 * EDGE-06 Plan 03: build EdgeWriteDeps whose wrapper fns POST a capture envelope to the
 * verify sink (via the SAME makeSinkHttp used by ghl/drchrono) instead of calling the
 * real Edge wrapper — so verify-mode edge writes are network-isolated identically to
 * the GHL/DrChrono verify paths. Each Edge wrapper's distinct signature is adapted to
 * the sink's (url, options) shape with a synthetic URL/body describing the op.
 */
function edgeSinkDeps(
  sinkUrl: string,
  eventId: string,
  direction: VerifyDirection,
  http?: GhlHttp,
): EdgeWriteDeps {
  const sinkHttp = makeSinkHttp({ sinkUrl, direction, eventId, http });
  const post = (opName: string, payload: unknown) =>
    sinkHttp(`edge:${opName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  return {
    createContact: async (_ctx, input) => post('contact:create', input),
    updateContact: async (_ctx, id, input) => post('contact:update', { id, input }),
    createBooking: async (_ctx, input) => post('appointment:create', input),
    updateBooking: async (_ctx, id, input) => post('appointment:update', { id, input }),
    cancelBooking: async (_ctx, id) => post('appointment:cancel', { id }),
  };
}

export interface DispatchInput {
  eventId: string;
  target: DispatchTarget;
  entity: GhlEntity | DcEntity;
  verb: GhlVerb | DcVerb;
  id?: string;
  body?: Record<string, unknown>;
  /** EHR auth token; required only when mode === 'on'. Not used for target 'edge'
   *  (buildEdgeCtx resolves+decrypts the Edge token internally). */
  token?: string;
  /** GHL-shaped location id — used to resolve the location's exact suppression-tag
   *  spelling for `on`-mode GHL contact writes, AND (for target 'edge') as the SAME
   *  id threaded through isLocationAllowed/FORBIDDEN_LOCATION_IDS and into
   *  buildEdgeCtx. Ignored for off/dry/verify GHL writes and for drchrono. */
  locationId?: string;
}

export interface DispatchDeps {
  mode?: WriteMode;
  ghlHttp?: GhlHttp;
  dcHttp?: DcHttp;
  retryDelayFactor?: number;
  /** Injectable sink POST fn for edge verify-mode capture (mirrors ghlHttp/dcHttp shape). */
  edgeHttp?: GhlHttp;
  /** Injectable edgeWrite for tests (defaults to the real writer). */
  edgeWriteFn?: typeof edgeWrite;
  /** Injectable buildEdgeCtx for tests (defaults to the real resolver). */
  buildEdgeCtxFn?: typeof buildEdgeCtx;
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
    input.target === 'ghl'
      ? 'drchrono_to_ghl'
      : input.target === 'edge'
        ? 'drchrono_to_edge'
        : 'ghl_to_drchrono';

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

  // Allowlist guard — last-line-of-defense before any live/verify write.
  // Forbidden real-practice IDs are hard-blocked here regardless of mode.
  if (!isLocationAllowed(input.locationId)) {
    log.error(
      { op, eventId: input.eventId, locationId: input.locationId },
      'write blocked — location not in allowlist (or is a forbidden real-practice ID)',
    );
    syncCounters.inc('sync_writes_skipped_off');
    return 'skipped-off';
  }

  // mode === 'verify' — build the REAL write but POST it to the sink, never the EHR.
  // No token is required; writers stamp a placeholder so the payload is fully built.
  const verify = mode === 'verify';
  const sink = verify ? resolveSinkUrl() : undefined;

  // EDGE-06 Plan 03: target 'edge' resolves its EdgeCtx (decrypt + demo-guardrail) here,
  // BEFORE the token guard below — edge never uses DispatchInput.token. Only ever called
  // for on/verify (off/dry already returned above) — no DB read / decrypt on the dead path.
  let edgeCtx: EdgeCtx | null = null;
  if (input.target === 'edge') {
    const buildCtx = deps.buildEdgeCtxFn ?? buildEdgeCtx;
    edgeCtx = await buildCtx(input.locationId!, {});
    if (!edgeCtx) {
      log.warn(
        { op, eventId: input.eventId, locationId: input.locationId },
        'edge write refused — buildEdgeCtx returned null (demo-guardrail / missing prerequisite)',
      );
      syncCounters.inc('sync_writes_skipped_off');
      return 'skipped-off';
    }
  }

  if (!verify && input.target !== 'edge' && !input.token) {
    // mode === 'on' but no token — never attempt an unauthenticated live write. Treat as dry.
    log.error({ op, eventId: input.eventId }, 'write mode on but no token — refusing live write');
    return 'dry-logged';
  }

  const token = input.token ?? '';

  try {
    if (input.target === 'edge') {
      const verifyDir: VerifyDirection = 'drchrono→edge';
      const edgeWriteImpl = deps.edgeWriteFn ?? edgeWrite;
      const edgeVerb: EdgeWriteVerb = input.verb === 'delete' ? 'cancel' : (input.verb as EdgeWriteVerb);
      const edgeDeps: EdgeWriteDeps = verify
        ? edgeSinkDeps(sink!, input.eventId, verifyDir, deps.edgeHttp)
        : { retryDelayFactor: deps.retryDelayFactor };
      await edgeWriteImpl(
        {
          eventId: input.eventId,
          entity: input.entity as EdgeWriteEntity,
          verb: edgeVerb,
          ctx: edgeCtx!,
          id: input.id,
          body: input.body,
        },
        edgeDeps,
      );
    } else if (input.target === 'ghl') {
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
