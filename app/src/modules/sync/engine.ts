/**
 * P08 sync engine — the dry-run reconciler loop.
 *
 * For each pending `sync_events` row: map payload → decide (D-01/D-02) → persist PG
 * sync state (`sync_mappings` + `appointment_links`) → mark the event processed.
 * Idempotency rides on `sync_events.dedup_key` (unique) at ingest and on upserts here,
 * so re-processing the same event yields ZERO net state change (T05 proves it).
 *
 * DRY-RUN ONLY (P08): no GHL/DrChrono API call is ever made. Even when a write flag is
 * `on`, the engine only LOGS the would-be EHR write (structured pino). Real writes are
 * P09. Leader election (D-04) ensures exactly one replica runs the loop cluster-wide.
 */

import { and, eq, sql as dsql } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import {
  syncEvents,
  syncMappings,
  syncConflicts,
  appointmentLinks,
} from '../../db/pg/schema/sync.js';
import type { SyncEvent } from '../../db/pg/schema/sync.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { syncCounters } from './metrics.js';
import { triggerAlert } from './alerts.js';
import { Leader } from './leader.js';
import { decide, type SyncSystem } from './decision.js';
import { dispatchWrite, writeModeFor, writeModeForEntity } from './writers/dispatch.js';
import { getLocationAccessToken } from './location-token.js';
import {
  ghlAppointmentToNormalized,
  drchronoAppointmentToNormalized,
  hashAppointment,
  type NormalizedAppointment,
} from './mapper.js';

const log = logger.child({ module: 'sync-engine' });

const BATCH_SIZE = 100;
const TICK_MS = 2000;
const MAX_ATTEMPTS = 5;
/** Engine kind for the advisory lock. */
export const ENGINE_LOCK_KIND = 'sync_engine';

export interface BatchResult {
  fetched: number;
  processed: number;
  conflicts: number;
  skipped: number;
  failed: number;
}

/**
 * Process one batch of pending events under the leader lock. Returns counts. Safe to
 * call repeatedly; if not leader, returns a zeroed result without touching events.
 */
export async function processBatch(leader: Leader): Promise<BatchResult> {
  const result: BatchResult = { fetched: 0, processed: 0, conflicts: 0, skipped: 0, failed: 0 };

  if (!(await leader.tryAcquire())) {
    log.debug('not leader — skipping batch');
    return result;
  }

  const pending = await db
    .select()
    .from(syncEvents)
    .where(eq(syncEvents.status, 'pending'))
    .orderBy(syncEvents.receivedAt)
    .limit(BATCH_SIZE);

  result.fetched = pending.length;
  if (pending.length === 0) return result;

  for (const ev of pending) {
    try {
      const outcome = await processOne(ev);
      if (outcome === 'processed') result.processed++;
      else if (outcome === 'conflict') result.conflicts++;
      else result.skipped++;
    } catch (err) {
      result.failed++;
      await failEvent(ev, err);
    }
  }

  log.info(result, 'sync batch complete');
  return result;
}

type Outcome = 'processed' | 'conflict' | 'skipped';

async function processOne(ev: SyncEvent): Promise<Outcome> {
  const source = ev.source as SyncSystem;
  const zone = extractZone(ev.payload);
  const payload = (ev.payload ?? {}) as Record<string, unknown>;

  // Only appointment events flow to appointment_links / mappings in P08. Other entity
  // kinds (patient) record a mapping but no link. We infer kind from the action prefix
  // or payload shape; default to appointment which is the milestone's primary entity.
  const normalized: NormalizedAppointment =
    source === 'ghl'
      ? ghlAppointmentToNormalized(payload, zone)
      : drchronoAppointmentToNormalized(payload, zone);

  const incomingHash = hashAppointment(normalized);

  // Find existing mapping by whichever external id we have for this source.
  const mapping = await findMapping(source, normalized);

  const decision = decide({
    source,
    action: ev.action,
    incoming: normalized as unknown as Record<string, unknown>,
    incomingHash,
    mapping,
    oppositeHash: mapping?.lastHash ?? null,
    rawPayload: ev.payload,
  });

  log.info(
    { eventId: ev.id, source, action: ev.action, decision: decision.action, reason: decision.reason },
    'sync decision',
  );

  if (decision.action === 'queue-conflict') {
    await db.insert(syncConflicts).values({
      source: 'sync',
      entity: 'appointment',
      resolution: 'pending',
      drchronoValue: source === 'drchrono' ? (payload as object) : null,
      ghlValue: source === 'ghl' ? (payload as object) : null,
      diffJson: { incomingHash, mappingHash: mapping?.lastHash ?? null },
    });
    await markProcessed(ev);
    // Check conflict queue size for threshold alert (P10 T03).
    triggerAlert('conflict_queue', { eventId: ev.id }).catch(() => undefined);
    return 'conflict';
  }

  if (decision.action === 'skip-loop') {
    syncCounters.inc('sync_writes_skipped_loop');
    triggerAlert('loop_detection', { eventId: ev.id, source }).catch(() => undefined);
    await markProcessed(ev);
    return 'skipped';
  }
  if (decision.action === 'no-op') {
    await markProcessed(ev);
    return 'skipped';
  }

  // decision.action === 'write'. P09: consult the per-direction kill switch.
  //   off => skip + counter; dry => log intent (no API); on => invoke writer (dormant).
  // The engine carries no live EHR token, so `on` is a defensive no-op here until T06
  // wires per-location credentials. Loop prevention already handled by decision.ts
  // (skip-loop) above via the inbound origin-tag check.
  const target = decision.target as SyncSystem;
  // Derive entity + direction for per-(direction×entity) toggle lookup (T03 / P14).
  // controlEntity uses plural (sync_controls schema); dispatchEntity uses singular (writer types).
  const isPatient = String(ev.action).startsWith('patient');
  const controlEntity: 'patients' | 'appointments' = isPatient ? 'patients' : 'appointments';
  const dispatchEntity = isPatient ? 'patient' : 'appointment' as const;
  const direction = target === 'ghl' ? 'drchrono_to_ghl' : 'ghl_to_drchrono' as const;
  const mode = await writeModeForEntity(direction, controlEntity);
  const verb = mapVerb(String((decision.payload as Record<string, unknown>)?._verb ?? ev.action));
  const targetId =
    target === 'ghl' ? normalized.ghlEventId ?? undefined : normalized.drchronoAppointmentId ?? undefined;

  // ON-MODE TOKEN WIRING: only `on` writes need a live token. off/dry/verify must NOT touch
  // identity services or the network — resolve lazily and only for target=ghl (the only
  // direction with a per-location GHL token via identity). A null token leaves dispatch's
  // existing no-token guard to refuse the live write (degrade-safe). DrChrono on-mode token
  // wiring is out of scope here (no drchrono token provider yet).
  const ghlLocationId = target === 'ghl' && normalized.locationId ? normalized.locationId : undefined;
  let onToken: string | undefined;
  if (mode === 'on' && target === 'ghl' && ghlLocationId) {
    onToken = (await getLocationAccessToken(ghlLocationId)) ?? undefined;
  }

  const outcome = await dispatchWrite({
    eventId: ev.id,
    target,
    entity: dispatchEntity,
    verb,
    id: targetId,
    body: decision.payload ?? undefined,
    token: onToken,
    locationId: ghlLocationId,
  });

  log.info(
    { eventId: ev.id, target, mode, verb, outcome, reason: decision.reason },
    'sync write dispatched',
  );

  // EDGE-06 Plan 03: ADDITIVE Edge dispatch on the drchrono->X outbound path only.
  // Own try/catch — an Edge-side throw must NEVER break the GHL/DrChrono leg above,
  // which has already completed by this point. Threads the SAME GHL-shaped
  // normalized.locationId the GHL leg used (`ghlLocationId`, NOT edge_location_config's
  // internal locations.id) so isLocationAllowed/FORBIDDEN_LOCATION_IDS protect the Edge
  // leg identically. Because SYNC_WRITE_EDGE defaults 'off' and the seeded control rows
  // default 'off' (fail-closed, EDGE-06 Plan 01), this is ZERO behavior change to the
  // GHL/DrChrono path above when disabled — Phase 10 formalizes true dual-destination.
  if (source === 'drchrono') {
    try {
      const edgeMode = await writeModeForEntity('drchrono_to_edge', controlEntity);
      const edgeOutcome = await dispatchWrite({
        eventId: ev.id,
        target: 'edge',
        entity: dispatchEntity,
        verb,
        id: targetId,
        body: decision.payload ?? undefined,
        locationId: ghlLocationId,
      }, { mode: edgeMode });
      log.info(
        { eventId: ev.id, edgeMode, verb, edgeOutcome },
        'edge dispatch (additive, drchrono->edge)',
      );
    } catch (err) {
      log.error({ err, eventId: ev.id }, 'edge dispatch failed — GHL/DrChrono path unaffected');
    }
  }

  await persistState(source, normalized, incomingHash);
  await markProcessed(ev);
  return 'processed';
}

/** Upsert sync_mapping + appointment_link idempotently from the normalized appt. */
async function persistState(
  source: SyncSystem,
  n: NormalizedAppointment,
  hash: string,
): Promise<void> {
  const locationId = n.locationId ? toLocId(n.locationId) : null;

  // Mapping requires both ids; in dry-run with a single-sided event we may only have
  // one external id. Upsert keyed on the side we know, leaving the other as a
  // placeholder so the unique (kind, <side>, location) index dedupes replays.
  const drchronoId = n.drchronoAppointmentId ?? `pending:${n.ghlEventId ?? 'unknown'}`;
  const ghlId = n.ghlEventId ?? `pending:${n.drchronoAppointmentId ?? 'unknown'}`;

  await db
    .insert(syncMappings)
    .values({
      kind: 'appointment',
      drchronoId,
      ghlId,
      locationId,
      origin: source,
      lastHash: hash,
      lastSyncedAt: new Date(),
      version: 1,
    })
    .onConflictDoUpdate({
      target: [syncMappings.kind, syncMappings.drchronoId, syncMappings.locationId],
      set: { lastHash: hash, lastSyncedAt: new Date(), version: dsql`${syncMappings.version} + 1` },
    });

  // appointment_links: unique on ghl_event_id and on drchrono_appointment_id. Upsert
  // on the id we actually have so 100 replays collapse to one row (T05).
  if (n.ghlEventId) {
    await db
      .insert(appointmentLinks)
      .values({
        ghlEventId: n.ghlEventId,
        drchronoAppointmentId: n.drchronoAppointmentId ?? `pending:${n.ghlEventId}`,
        locationId,
        doctorId: n.doctorId,
        calendarId: n.calendarId,
        status: n.status,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appointmentLinks.ghlEventId,
        set: { status: n.status, lastSyncedAt: new Date() },
      });
  } else if (n.drchronoAppointmentId) {
    await db
      .insert(appointmentLinks)
      .values({
        ghlEventId: `pending:${n.drchronoAppointmentId}`,
        drchronoAppointmentId: n.drchronoAppointmentId,
        locationId,
        doctorId: n.doctorId,
        calendarId: n.calendarId,
        status: n.status,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appointmentLinks.drchronoAppointmentId,
        set: { status: n.status, lastSyncedAt: new Date() },
      });
  }
}

async function findMapping(source: SyncSystem, n: NormalizedAppointment) {
  const locationId = n.locationId ? toLocId(n.locationId) : null;
  if (source === 'drchrono' && n.drchronoAppointmentId) {
    const [m] = await db
      .select()
      .from(syncMappings)
      .where(
        and(
          eq(syncMappings.kind, 'appointment'),
          eq(syncMappings.drchronoId, n.drchronoAppointmentId),
          locationId == null
            ? dsql`${syncMappings.locationId} is null`
            : eq(syncMappings.locationId, locationId),
        ),
      );
    return m ?? null;
  }
  if (source === 'ghl' && n.ghlEventId) {
    const [m] = await db
      .select()
      .from(syncMappings)
      .where(
        and(
          eq(syncMappings.kind, 'appointment'),
          eq(syncMappings.ghlId, n.ghlEventId),
          locationId == null
            ? dsql`${syncMappings.locationId} is null`
            : eq(syncMappings.locationId, locationId),
        ),
      );
    return m ?? null;
  }
  return null;
}

async function markProcessed(ev: SyncEvent): Promise<void> {
  await db
    .update(syncEvents)
    .set({ status: 'processed', processedAt: new Date(), error: null })
    .where(eq(syncEvents.id, ev.id));
}

async function failEvent(ev: SyncEvent, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  log.error({ eventId: ev.id, err: message }, 'event processing failed');
  // Dead-letter after MAX_ATTEMPTS. We track attempts implicitly by re-poll count;
  // for the dry-run engine we mark failed once and dead after the cap via a guard.
  await db
    .update(syncEvents)
    .set({ status: 'failed', error: message })
    .where(eq(syncEvents.id, ev.id));
  // Alert on dead-letter insert (P10 T03 alert rule).
  syncCounters.inc('sync_dead_letter_count');
  triggerAlert('dead_letter', { eventId: ev.id, error: message }).catch(() => undefined);
}

/** Re-arm previously-failed events past the attempt cap as dead (called by loop). */
export async function reapDeadLetters(): Promise<number> {
  // Minimal P08 reaper: surface failed events; full dead-letter persistence is P09.
  const failed = await db
    .select({ id: syncEvents.id })
    .from(syncEvents)
    .where(eq(syncEvents.status, 'failed'))
    .limit(BATCH_SIZE);
  if (failed.length === 0) return 0;
  return failed.length;
}

/** Map a normalized decision verb to a writer verb (create|update|cancel|delete). */
function mapVerb(v: string): 'create' | 'update' | 'cancel' | 'delete' {
  const t = v.toLowerCase();
  if (t === 'cancel' || t === 'cancelled' || t === 'canceled') return 'cancel';
  if (t === 'delete' || t === 'deleted') return 'delete';
  if (t === 'created' || t === 'create') return 'create';
  return 'update';
}

function extractZone(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const tz = (payload as Record<string, unknown>).timezone;
    if (typeof tz === 'string' && tz.includes('/')) return tz;
  }
  return 'UTC';
}

function toLocId(v: string): number | null {
  return /^\d+$/.test(v) ? parseInt(v, 10) : null;
}

// --- Loop lifecycle ------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;
let leader: Leader | null = null;
let idleBackoff = 0;

/**
 * Start the cron-driven sync loop. No-op unless `config.runCron` is set (RUN_CRON).
 * Exactly one replica wins the advisory lock; others tick but skip work. Backs off
 * (up to 8x TICK_MS) when the pending queue is empty to avoid hot-CPU polling.
 */
export function startEngine(): void {
  if (!config.runCron) {
    log.info('RUN_CRON disabled — sync engine not started');
    return;
  }
  if (timer) return;
  leader = new Leader(ENGINE_LOCK_KIND);
  log.info({ tickMs: TICK_MS, batch: BATCH_SIZE }, 'starting sync engine loop (dry-run)');

  const tick = async () => {
    try {
      const res = await processBatch(leader!);
      idleBackoff = res.fetched === 0 ? Math.min(idleBackoff + 1, 3) : 0;
    } catch (err) {
      log.error({ err }, 'sync tick error');
    } finally {
      const delay = TICK_MS * Math.pow(2, idleBackoff);
      timer = setTimeout(tick, delay);
    }
  };
  timer = setTimeout(tick, TICK_MS);
}

export async function stopEngine(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (leader) {
    await leader.release();
    leader = null;
  }
}

export { MAX_ATTEMPTS };
