/**
 * P09 T02 — webhook ingest helper.
 *
 * Webhook receivers call `ingestEvent` to persist a raw EHR event into `sync_events`
 * with a deterministic `dedup_key`, then ack immediately. The P08 engine picks the
 * row up on its next tick. Idempotency lives entirely on the `dedup_key` unique index:
 * `ON CONFLICT (dedup_key) DO NOTHING` makes replays of the same webhook a no-op (one
 * row regardless of delivery count).
 *
 * Pure dedup-key computation (`dedupKey`) is exported separately so it can be unit
 * tested + reused by the backfill script (T05).
 */

import crypto from 'crypto';
import { db } from '../../db/pg/client.js';
import { syncEvents } from '../../db/pg/schema/sync.js';
import { parse as parseOrigin } from './origin.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-ingest' });

export type SyncSource = 'ghl' | 'drchrono' | 'edge';

export interface IngestInput {
  source: SyncSource;
  /** Normalized verb: created | updated | cancelled | deleted | rescheduled. */
  action: string;
  /** Stable external id of the entity (GHL event/contact id or DrChrono appt/patient id). */
  externalId: string;
  payload: Record<string, unknown>;
  /** Optional explicit version/etag; when absent a payload hash is used. */
  version?: string | number | null;
}

export interface IngestResult {
  inserted: boolean;
  dedupKey: string;
}

/**
 * Deterministic dedup key: `${source}:${action}:${externalId}:${version_or_hash}`.
 * Same webhook delivered twice => identical key => the unique index collapses it.
 */
export function dedupKey(input: {
  source: string;
  action: string;
  externalId: string;
  payload: unknown;
  version?: string | number | null;
}): string {
  const ver =
    input.version != null && input.version !== ''
      ? String(input.version)
      : payloadHash(input.payload);
  return `${input.source}:${input.action.toLowerCase()}:${input.externalId}:${ver}`;
}

function payloadHash(payload: unknown): string {
  const json = stableStringify(payload);
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/** Order-independent JSON stringify so key-ordering changes don't break dedup. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Persist an event to sync_events idempotently. Returns whether a new row was inserted.
 * Never throws on conflict — replays are silent no-ops. The origin tag (if the payload
 * carries one) is stored so the engine's loop guard can recognize self-authored echoes.
 */
export async function ingestEvent(input: IngestInput): Promise<IngestResult> {
  const key = dedupKey({
    source: input.source,
    action: input.action,
    externalId: input.externalId,
    payload: input.payload,
    version: input.version,
  });

  const origin = parseOrigin(input.payload);

  const rows = await db
    .insert(syncEvents)
    .values({
      source: input.source,
      action: input.action,
      payload: input.payload,
      status: 'pending',
      dedupKey: key,
      originTag: origin ? `${origin.system}:${origin.eventId}` : null,
    })
    .onConflictDoNothing({ target: syncEvents.dedupKey })
    .returning({ id: syncEvents.id });

  const inserted = rows.length > 0;
  log.info({ source: input.source, action: input.action, dedupKey: key, inserted }, 'webhook ingested');
  return { inserted, dedupKey: key };
}
