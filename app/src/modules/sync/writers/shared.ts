/**
 * P09 T03 — shared writer plumbing: exponential-backoff retry + dead-letter.
 *
 * Writers (ghl.ts / drchrono.ts) perform a single idempotent HTTP attempt via the
 * supplied `attempt` fn. This wrapper retries transient failures (5xx / network) up to
 * MAX_RETRIES with exponential backoff. On final failure it records the event into
 * `sync_dead_letter` and fires a (rate-aware) Telegram alert.
 *
 * DORMANT in normal operation: writers are only invoked by the engine when a
 * `SYNC_WRITE_*` flag is `on` (user-gated, T06). Until then this code never runs against
 * a live EHR. The dead-letter Telegram alert is itself gated so dormant/dry paths never
 * page anyone.
 */

import { db } from '../../../db/pg/client.js';
import { syncDeadLetter } from '../../../db/pg/schema/sync.js';
import { logger } from '../../../logger.js';

const log = logger.child({ module: 'sync-writer' });

export const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;

export interface AttemptResult {
  status: number;
  data: unknown;
}

export interface WriteContext {
  /** sync_events.id this write derives from (FK target for dead-letter). */
  eventId: string;
  /** Human label for logs (e.g. 'ghl:createAppointment'). */
  op: string;
  payload?: unknown;
}

export class WriteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: unknown,
  ) {
    super(message);
    this.name = 'WriteError';
  }
}

const isRetryable = (status: number) => status < 0 || status === 429 || status >= 500;

/** Sleep helper; injectable delay multiplier keeps unit tests fast (pass 0). */
function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
}

export interface RetryOptions {
  /** Multiplier on backoff delay; tests pass 0 to disable real sleeping. */
  delayFactor?: number;
}

/**
 * Run `attempt` with exponential-backoff retry on transient failures. On success
 * returns the result. On exhaustion writes a dead-letter row + alert and throws
 * WriteError.
 */
export async function withRetry(
  ctx: WriteContext,
  attempt: () => Promise<AttemptResult>,
  opts: RetryOptions = {},
): Promise<AttemptResult> {
  const factor = opts.delayFactor ?? 1;
  let last: AttemptResult = { status: -1, data: 'no attempt made' };

  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      last = await attempt();
    } catch (err) {
      last = { status: -1, data: err instanceof Error ? err.message : String(err) };
    }

    if (last.status >= 200 && last.status < 300) {
      if (i > 0) log.info({ op: ctx.op, attempts: i + 1 }, 'write succeeded after retry');
      return last;
    }

    if (!isRetryable(last.status) || i === MAX_RETRIES) break;

    const backoff = BASE_DELAY_MS * Math.pow(2, i) * factor;
    log.warn({ op: ctx.op, status: last.status, attempt: i + 1, backoff }, 'write retrying');
    await delay(backoff);
  }

  await deadLetter(ctx, last);
  throw new WriteError(`${ctx.op} failed after retries`, last.status, last.data);
}

/** Persist a dead-letter row and fire a gated alert. Best-effort: never throws. */
export async function deadLetter(ctx: WriteContext, last: AttemptResult): Promise<void> {
  const lastError = `status=${last.status} ${stringifyData(last.data)}`.slice(0, 2000);
  try {
    await db.insert(syncDeadLetter).values({
      eventId: ctx.eventId,
      attempts: MAX_RETRIES + 1,
      lastError,
      payload: (ctx.payload ?? null) as object | null,
    });
  } catch (err) {
    log.error({ err, op: ctx.op }, 'failed to write dead-letter row');
  }
  log.error({ op: ctx.op, eventId: ctx.eventId, lastError }, 'event dead-lettered');
  alertDeadLetter(ctx, lastError);
}

/**
 * Telegram dead-letter alert. Gated: only fires when at least one write direction is
 * actually `on` — so dormant/dry deployments never page. (T03 risk row.) Best-effort.
 */
function alertDeadLetter(ctx: WriteContext, lastError: string): void {
  const anyWriteOn =
    process.env.SYNC_WRITE_DRCHRONO_TO_GHL === 'on' ||
    process.env.SYNC_WRITE_GHL_TO_DRCHRONO === 'on';
  if (!anyWriteOn) {
    log.debug({ op: ctx.op }, 'dead-letter alert suppressed — no write direction is on');
    return;
  }
  try {
    // Lazy import to avoid pulling the Telegram bot (which opens a polling socket) into
    // the writer's module graph unless an alert actually fires.
    void import('../../notifications/telegram.js').then(({ telegramService }) => {
      telegramService.sendMessage({
        timestamp: new Date().toISOString(),
        severity: 'Error',
        message: `Sync dead-letter: ${ctx.op} (event ${ctx.eventId}) — ${lastError}`,
      });
    });
  } catch (err) {
    log.error({ err }, 'dead-letter telegram alert failed');
  }
}

function stringifyData(d: unknown): string {
  if (typeof d === 'string') return d;
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
}

/** Stable idempotency key for a write derived from the originating event + op. */
export function idempotencyKey(eventId: string, op: string): string {
  return `tlp-sync:${op}:${eventId}`;
}
