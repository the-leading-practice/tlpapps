/**
 * EDGE-07 T01 — Edge inbound webhook HMAC verification.
 *
 * The Edge emitter signs each webhook with HMAC-SHA256 over the exact bytes
 * "{X-Edge-Timestamp}.{rawBody}" using a shared secret (EDGE_WEBHOOK_SECRET). This
 * mirrors verify-ghl-signature.ts's structure but is HMAC-only (no RSA path — Edge
 * is a single shared-secret webhook source, not a marketplace app).
 *
 * The signed bytes are built via Buffer.concat over the exact raw body buffer —
 * NEVER a literal `+` between two Buffers (that coerces to string and breaks real
 * interop with the Edge emitter) and NEVER a re-serialization of the parsed body.
 *
 * A 300s replay window rejects stale deliveries; timing-safe comparison guards
 * against signature-oracle timing attacks. Pure/injectable (no network I/O) so this
 * is fully unit-testable.
 */

import crypto from 'crypto';

/** Header Edge uses for the body signature. Lower-cased by Express. */
export const EDGE_SIGNATURE_HEADER = 'x-edge-signature';
/** Header Edge uses for the delivery timestamp (unix seconds). */
export const EDGE_TIMESTAMP_HEADER = 'x-edge-timestamp';

/** Replay window: reject deliveries whose timestamp skew exceeds this many seconds. */
export const EDGE_SIGNATURE_SKEW_SECONDS = 300;

export interface VerifyEdgeSignatureInput {
  rawBody: Buffer | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string | undefined;
  /** Injectable "now" (unix seconds) for deterministic skew tests. */
  nowSec?: number;
}

export interface VerifyEdgeResult {
  ok: boolean;
  reason: string;
}

/**
 * Pure verifier. HMAC-SHA256 hex of "{timestamp}.{rawBody}" with `secret`, 'sha256='
 * prefix optional (stripped case-insensitively), |now - timestamp| <= 300s. No
 * network I/O — unit-testable in isolation.
 */
export function verifyEdgeSignature(input: VerifyEdgeSignatureInput): VerifyEdgeResult {
  const { rawBody, signature, timestamp, secret } = input;

  if (!secret) return { ok: false, reason: 'missing-secret' };
  if (!signature) return { ok: false, reason: 'missing-signature' };
  if (!timestamp) return { ok: false, reason: 'missing-timestamp' };
  if (rawBody == null) return { ok: false, reason: 'missing-raw-body' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'missing-timestamp' };

  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > EDGE_SIGNATURE_SKEW_SECONDS) {
    return { ok: false, reason: 'timestamp-skew' };
  }

  // Sign the EXACT bytes "{timestamp}.{rawBody}" — Buffer.concat over the raw body
  // buffer, never a re-serialized body and never a literal `+` between two Buffers.
  const signedBytes = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const expectedHex = crypto.createHmac('sha256', secret).update(signedBytes).digest('hex');

  const provided = signature.replace(/^sha256=/i, '').trim();

  if (!timingSafeEqualStr(provided, expectedHex)) {
    return { ok: false, reason: 'signature-mismatch' };
  }
  return { ok: true, reason: 'hmac-match' };
}

/** Length-aware timing-safe string compare (returns false on length mismatch, never throws). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
