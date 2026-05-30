/**
 * P09 T04 — writer dispatch. Bridges an engine decision to the concrete EHR writer
 * based on the per-direction kill switch.
 *
 * Modes (read per target direction from env):
 *   off : skip entirely, increment `sync_writes_skipped_off` counter. No writer call.
 *   dry : log the would-be write intent. No API call. (DEFAULT — defaults stay dry.)
 *   on  : invoke the real writer (DORMANT until user flips the flag in T06).
 *
 * The `http` and writer fns are injectable so the engine wiring can be unit-tested with
 * mocks (assert: dry => writer never called; on => writer called once).
 */

import { logger } from '../../../logger.js';
import type { SyncSystem } from '../decision.js';
import { ghlWrite, type GhlEntity, type GhlVerb, type HttpFn as GhlHttp } from './ghl.js';
import {
  drchronoWrite,
  type DcEntity,
  type DcVerb,
  type HttpFn as DcHttp,
} from './drchrono.js';

const log = logger.child({ module: 'writer-dispatch' });

export type WriteMode = 'off' | 'dry' | 'on';

/** Resolve the kill-switch mode for a write INTO `target`. */
export function writeModeFor(target: SyncSystem, env: NodeJS.ProcessEnv = process.env): WriteMode {
  const v =
    target === 'ghl' ? env.SYNC_WRITE_DRCHRONO_TO_GHL : env.SYNC_WRITE_GHL_TO_DRCHRONO;
  if (v === 'on') return 'on';
  if (v === 'off') return 'off';
  return 'dry';
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
}

export interface DispatchDeps {
  mode?: WriteMode;
  ghlHttp?: GhlHttp;
  dcHttp?: DcHttp;
  retryDelayFactor?: number;
}

export type DispatchOutcome = 'skipped-off' | 'dry-logged' | 'written';

/** In-memory counter for skipped-off writes (surfaced by engine batch logs). */
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

  if (mode === 'off') {
    counters.sync_writes_skipped_off++;
    log.info({ op, eventId: input.eventId }, 'write skipped — kill switch off');
    return 'skipped-off';
  }

  if (mode === 'dry') {
    log.info({ op, eventId: input.eventId, dryRun: true }, 'dry-run: write intent only (no API call)');
    return 'dry-logged';
  }

  // mode === 'on' — invoke the real writer (DORMANT path).
  if (!input.token) {
    // Defensive: never attempt an unauthenticated live write. Treat as dry.
    log.error({ op, eventId: input.eventId }, 'write mode on but no token — refusing live write');
    return 'dry-logged';
  }

  if (input.target === 'ghl') {
    await ghlWrite(
      {
        eventId: input.eventId,
        entity: input.entity as GhlEntity,
        verb: input.verb as GhlVerb,
        token: input.token,
        id: input.id,
        body: input.body,
      },
      deps.ghlHttp,
      { delayFactor: deps.retryDelayFactor },
    );
  } else {
    await drchronoWrite(
      {
        eventId: input.eventId,
        entity: input.entity as DcEntity,
        verb: input.verb as DcVerb,
        token: input.token,
        id: input.id,
        body: input.body,
      },
      deps.dcHttp,
      { delayFactor: deps.retryDelayFactor },
    );
  }
  log.info({ op, eventId: input.eventId }, 'live write completed');
  return 'written';
}
