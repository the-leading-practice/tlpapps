/**
 * CRM webhook receiver — handles GHL events posted to
 * /api/webhook/crm/:resource/:action (e.g. contact/updated, appointment/created).
 *
 * Signature policy (stops GHL auto-pause while keeping security tight):
 *   - Header present + valid   → ingest into sync_events, ack 200
 *   - Header present + invalid → 401 (genuine tamper attempt)
 *   - Header absent            → 200 no-ingest (GHL health pings / unsigned probes;
 *                                 logs a warning so we can tell how often this occurs)
 *
 * The handler re-uses the same ingestEvent + normalizeAction + externalIdOf logic
 * as ghlSyncWebhook — those helpers are extracted from ghl.ts so both routes share
 * one implementation.
 */

import type { Request, Response } from 'express';
import { ingestEvent } from '../sync/ingest.js';
import { verifyGhlSignature, GHL_SIGNATURE_HEADER } from './verify-ghl-signature.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'webhook-crm' });

/** Map GHL webhook event types / path action segments to normalized sync verbs. */
export function normalizeAction(raw: string | undefined): string {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('delete')) return 'deleted';
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('reschedul') || t.includes('moved')) return 'rescheduled';
  if (t.includes('create')) return 'created';
  if (t.includes('update') || t.includes('modify')) return 'updated';
  return t || 'updated';
}

/** Best-effort external id extraction across GHL appointment/contact payload shapes. */
export function externalIdOf(body: Record<string, unknown>): string | null {
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

/**
 * Handler for POST /webhook/crm/:resource/:action.
 * Never throws — always returns 200 or 401.
 */
export async function crmSyncWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.header(GHL_SIGNATURE_HEADER) ?? undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const secret = process.env.GHL_WEBHOOK_SECRET;

  // --- Signature gate ---
  if (signature !== undefined) {
    // Header was sent — must be valid or we reject.
    const result = verifyGhlSignature(rawBody, signature, secret);
    if (!result.ok) {
      log.warn({ reason: result.reason }, 'crm webhook signature invalid');
      res.status(401).json({ error: 'invalid webhook signature', reason: result.reason });
      return;
    }
  } else {
    // No signature at all — ack 200 but do not trust/ingest the body.
    log.warn(
      { resource: req.params.resource, action: req.params.action },
      'crm webhook received with no signature — acking without ingest',
    );
    res.status(200).json({ ok: true, ingested: false, reason: 'no-signature' });
    return;
  }

  // --- Verified: ingest ---
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Prefer body event type; fall back to path params for action derivation.
  const rawType = (body.type ?? body.eventType ?? body.event) as string | undefined;
  const pathAction = `${req.params.resource ?? ''}-${req.params.action ?? ''}`;
  const action = normalizeAction(rawType ?? pathAction);
  const externalId = externalIdOf(body);

  if (!externalId) {
    log.warn({ rawType, resource: req.params.resource, action }, 'crm webhook missing external id — acking, not ingesting');
    res.status(200).json({ ok: true, ingested: false, reason: 'no-external-id' });
    return;
  }

  try {
    const result = await ingestEvent({ source: 'ghl', action, externalId, payload: body });
    res.status(200).json({ ok: true, ingested: result.inserted, dedupKey: result.dedupKey });
  } catch (err) {
    log.error({ err }, 'crm webhook ingest failed');
    res.status(200).json({ ok: true, ingested: false, error: 'ingest-failed' });
  }
}
