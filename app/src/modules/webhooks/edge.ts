/**
 * EDGE-07 T02 — Edge inbound webhook receiver, handling `POST /api/edge/webhook`
 * per EDGE-07-WEBHOOK-CONTRACT.md.
 *
 * Signature policy (mirrors crm.ts EXACTLY — GHL auto-pause precedent kept for parity):
 *   - Header present + valid   → verify -> ingest into sync_events, ack 200
 *   - Header present + invalid → 401 (genuine tamper / skew)
 *   - Header absent            → 200 no-ingest (fail-safe; logs a warning)
 *
 * Dedup rides on `version: X-Edge-Delivery` threaded into ingestEvent's dedupKey —
 * a replayed delivery (same X-Edge-Delivery) collapses via ON CONFLICT DO NOTHING,
 * `inserted:false`, and the handler still acks 200 without reprocessing.
 *
 * The handler NEVER throws — always 200 or 401.
 */

import type { Request, Response } from 'express';
import { ingestEvent } from '../sync/ingest.js';
import {
  verifyEdgeSignature,
  EDGE_SIGNATURE_HEADER,
  EDGE_TIMESTAMP_HEADER,
} from './verify-edge-signature.js';
import { normalizeAction } from './crm.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'webhook-edge' });

/**
 * Handler for POST /edge/webhook. Never throws — always returns 200 or 401.
 */
export async function edgeSyncWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.header(EDGE_SIGNATURE_HEADER) ?? undefined;
  const timestamp = req.header(EDGE_TIMESTAMP_HEADER) ?? undefined;
  const deliveryId = req.header('x-edge-delivery') ?? undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const secret = process.env.EDGE_WEBHOOK_SECRET;

  // --- Signature gate ---
  if (signature !== undefined) {
    // Header was sent — must be valid or we reject.
    const result = verifyEdgeSignature({ rawBody, signature, timestamp, secret });
    if (!result.ok) {
      log.warn({ reason: result.reason }, 'edge webhook signature invalid');
      res.status(401).json({ error: 'invalid webhook signature', reason: result.reason });
      return;
    }
  } else {
    // No signature at all — ack 200 but do not trust/ingest the body (fail-safe).
    log.warn({ deliveryId }, 'edge webhook received with no signature — acking without ingest');
    res.status(200).json({ ok: true, ingested: false, reason: 'no-signature' });
    return;
  }

  // --- Verified: ingest ---
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Per EDGE-07-WEBHOOK-CONTRACT.md: { event, business_id, entity, verb, id, occurred_at, data, origin }.
  const rawEvent = (body.event as string | undefined) ?? undefined;
  const entity = (body.entity as string | undefined) ?? undefined; // 'contact' | 'appointment'
  const rawVerb = (body.verb as string | undefined) ?? rawEvent;
  const action = normalizeAction(rawVerb);
  const externalId = typeof body.id === 'string' ? body.id : body.id != null ? String(body.id) : null;

  if (!externalId) {
    log.warn({ rawEvent, entity }, 'edge webhook missing external id — acking, not ingesting');
    res.status(200).json({ ok: true, ingested: false, reason: 'no-external-id' });
    return;
  }

  try {
    const result = await ingestEvent({
      source: 'edge',
      action,
      externalId,
      payload: body,
      version: deliveryId,
    });
    res.status(200).json({ ok: true, ingested: result.inserted, dedupKey: result.dedupKey });
  } catch (err) {
    log.error({ err }, 'edge webhook ingest failed');
    res.status(200).json({ ok: true, ingested: false, error: 'ingest-failed' });
  }
}
