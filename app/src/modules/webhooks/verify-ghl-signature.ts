/**
 * P09 T01 — GHL webhook HMAC verification.
 *
 * GHL signs each webhook with HMAC-SHA256 over the raw request body using a shared
 * secret. AUDIT §16/§17 flagged the three GHL webhook receivers as UNSIGNED — this
 * middleware closes that gap: reject (401) any request whose signature header does not
 * match the HMAC of the raw bytes we received.
 *
 * The secret comes from the runtime env (`GHL_WEBHOOK_SECRET`), injected by the
 * gateway/Coolify — never hardcoded. If no secret is configured the middleware fails
 * CLOSED (401) rather than silently trusting unsigned traffic, EXCEPT it returns a
 * distinct log so misconfiguration is obvious in prod.
 *
 * The raw body is captured by the `express.json({ verify })` hook in server.ts as
 * `req.rawBody`. Timing-safe comparison guards against signature-oracle timing attacks.
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/** Header GHL uses for the body HMAC. Lower-cased by Express. */
export const GHL_SIGNATURE_HEADER = 'x-wh-signature';

export interface VerifyResult {
  ok: boolean;
  reason: string;
}

/**
 * Pure verifier: returns whether `signature` is a valid HMAC-SHA256 of `rawBody`
 * under `secret`. Accepts hex or base64 signature encodings (GHL has used hex).
 * No I/O — unit-testable in isolation.
 */
export function verifyGhlSignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined,
): VerifyResult {
  if (!secret) return { ok: false, reason: 'no-secret-configured' };
  if (!signature) return { ok: false, reason: 'missing-signature' };
  if (rawBody == null) return { ok: false, reason: 'missing-raw-body' };

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expectedHex = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const expectedB64 = crypto.createHmac('sha256', secret).update(body).digest('base64');

  // Strip an optional `sha256=` prefix some providers prepend.
  const provided = signature.replace(/^sha256=/i, '').trim();

  if (timingSafeEqualStr(provided, expectedHex)) return { ok: true, reason: 'hex-match' };
  if (timingSafeEqualStr(provided, expectedB64)) return { ok: true, reason: 'base64-match' };
  return { ok: false, reason: 'signature-mismatch' };
}

/** Length-aware timing-safe string compare (returns false on length mismatch). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Express middleware enforcing GHL signature verification. Mount BEFORE any GHL
 * webhook handler. Responds 401 on any failure; calls next() only on a valid sig.
 */
export function ghlSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  const signature = req.header(GHL_SIGNATURE_HEADER) ?? undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  const result = verifyGhlSignature(rawBody, signature, secret);
  if (!result.ok) {
    res.status(401).json({ error: 'invalid webhook signature', reason: result.reason });
    return;
  }
  next();
}
