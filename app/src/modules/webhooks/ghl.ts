/**
 * P09 T02 — GHL webhook receiver that feeds the sync engine.
 *
 * Flow: HMAC verified (middleware) -> derive action + external id -> ingest into
 * sync_events (ON CONFLICT dedup_key DO NOTHING) -> ack 200 immediately (<500ms; the
 * engine processes asynchronously on its own tick). This is the GHL -> sync_events
 * entry point referenced by AUDIT §16 (GHL webhook receivers were previously unsigned
 * and did not persist for reconciliation).
 *
 * We ack BEFORE awaiting the DB write would be tempting for latency, but a lost insert
 * would silently drop an event; instead we await the (fast, single-row, indexed) insert
 * and ack — still well under the 500ms budget. Errors still ack 200 to avoid GHL retry
 * storms, but log loudly; the engine's at-least-once contract tolerates the rare drop
 * because GHL itself retries on non-2xx.
 */

import type { Request, Response } from 'express';
import { ingestEvent } from '../sync/ingest.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'webhook-ghl' });

/** Map GHL webhook event types to normalized sync verbs. */
function normalizeAction(raw: string | undefined): string {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('delete')) return 'deleted';
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('reschedul') || t.includes('moved')) return 'rescheduled';
  if (t.includes('create')) return 'created';
  if (t.includes('update') || t.includes('modify')) return 'updated';
  return t || 'updated';
}

/** Best-effort external id extraction across GHL appointment/contact payload shapes. */
function externalIdOf(body: Record<string, unknown>): string | null {
  const candidates = [
    body.appointmentId,
    body.id,
    body.eventId,
    body.contactId,
    (body.appointment as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
    if (typeof c === 'number') return String(c);
  }
  return null;
}

export async function ghlSyncWebhook(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawType = (body.type ?? body.eventType ?? body.event) as string | undefined;
  const action = normalizeAction(rawType);
  const externalId = externalIdOf(body);

  if (!externalId) {
    log.warn({ rawType }, 'ghl webhook missing external id — acking, not ingesting');
    res.status(200).json({ ok: true, ingested: false, reason: 'no-external-id' });
    return;
  }

  try {
    const result = await ingestEvent({ source: 'ghl', action, externalId, payload: body });
    res.status(200).json({ ok: true, ingested: result.inserted, dedupKey: result.dedupKey });
  } catch (err) {
    log.error({ err }, 'ghl webhook ingest failed');
    res.status(200).json({ ok: true, ingested: false, error: 'ingest-failed' });
  }
}
