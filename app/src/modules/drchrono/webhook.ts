/**
 * P09 T02 — DrChrono webhook receiver that feeds the sync engine.
 *
 * DrChrono does NOT use HMAC; it sends a plaintext `secret_token` in the body (AUDIT
 * §16). We compare it against `DRCHRONO_WEBHOOK_SECRET` from env (gateway-injected,
 * never hardcoded) and reject 403 on mismatch. On success we ingest into sync_events
 * with a deterministic dedup_key and ack immediately. The P08 engine processes the row.
 *
 * This is additive to the existing `drChronoController.handleWebhook` (which drives the
 * legacy patient-service forwarding). The sync receiver only persists for the new
 * DrChrono <-> GHL reconciliation path and never makes an EHR write itself.
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';
import { ingestEvent } from '../sync/ingest.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'webhook-drchrono' });

/** Map DrChrono action verbs (APPOINTMENT_CREATE, PATIENT_MODIFY, ...) to sync verbs. */
function normalizeAction(raw: string | undefined): string {
  const t = (raw ?? '').toUpperCase();
  if (t.endsWith('_DELETE')) return 'deleted';
  if (t.endsWith('_CREATE')) return 'created';
  if (t.endsWith('_MODIFY')) return 'updated';
  return (raw ?? 'updated').toLowerCase();
}

function externalIdOf(obj: Record<string, unknown> | undefined): string | null {
  if (!obj) return null;
  const id = obj.id;
  if (typeof id === 'string' && id) return id;
  if (typeof id === 'number') return String(id);
  return null;
}

/**
 * DrChrono webhook verification challenge. When a webhook is registered/verified,
 * DrChrono sends a GET to the callback URL with `?msg=<token>`; the endpoint must
 * reply 200 with `{ secret_token: HMAC_SHA256_hex(msg, <Secret Token>) }`. This is
 * the pure HMAC core (no Express), unit-tested directly.
 */
export function drchronoVerifyToken(msg: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex');
}

/** Timing-safe plaintext secret comparison. */
export function verifyDrchronoSecret(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function drchronoSyncWebhook(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const secret = process.env.DRCHRONO_WEBHOOK_SECRET;

  if (!verifyDrchronoSecret(body.secret_token as string | undefined, secret)) {
    log.warn('drchrono webhook rejected — secret_token mismatch');
    res.status(403).json({ error: 'invalid secret_token' });
    return;
  }

  const action = normalizeAction(body.action as string | undefined);
  const obj = body.object as Record<string, unknown> | undefined;
  const externalId = externalIdOf(obj);

  if (!externalId) {
    log.warn({ action }, 'drchrono webhook missing object id — acking, not ingesting');
    res.status(200).json({ ok: true, ingested: false, reason: 'no-external-id' });
    return;
  }

  try {
    // Persist the inner object as payload (that's the entity the engine maps); keep
    // the action alongside via dedup_key composition.
    const result = await ingestEvent({
      source: 'drchrono',
      action,
      externalId,
      payload: obj ?? body,
    });
    res.status(200).json({ ok: true, ingested: result.inserted, dedupKey: result.dedupKey });
  } catch (err) {
    log.error({ err }, 'drchrono webhook ingest failed');
    res.status(200).json({ ok: true, ingested: false, error: 'ingest-failed' });
  }
}
