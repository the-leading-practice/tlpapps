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

/** Header GHL uses for the body signature. Lower-cased by Express. */
export const GHL_SIGNATURE_HEADER = 'x-wh-signature';

/**
 * GoHighLevel / LeadConnector Marketplace webhook public key (RSA-4096).
 * Marketplace apps' webhooks are signed with GHL's PRIVATE key; we verify with
 * this PUBLIC key (RSA-SHA256 over the raw body, base64 signature). This is a
 * published public key — safe to embed. Override via GHL_WEBHOOK_PUBLIC_KEY if
 * GHL ever rotates it.
 */
export const GHL_DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

export interface VerifyResult {
  ok: boolean;
  reason: string;
}

/**
 * Pure verifier. Accepts a GHL webhook signature via EITHER:
 *   1. RSA-SHA256 against GHL's marketplace public key (default path — what real
 *      Marketplace deliveries use; base64 signature). Overridable via
 *      GHL_WEBHOOK_PUBLIC_KEY.
 *   2. HMAC-SHA256 against a shared `secret` (for workflow/custom webhooks),
 *      hex or base64.
 * No network I/O — unit-testable in isolation.
 */
export function verifyGhlSignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined,
): VerifyResult {
  if (!signature) return { ok: false, reason: 'missing-signature' };
  if (rawBody == null) return { ok: false, reason: 'missing-raw-body' };

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const provided = signature.replace(/^sha256=/i, '').trim();

  // 1. RSA public-key verification (GHL Marketplace) — default.
  const pubKey = process.env.GHL_WEBHOOK_PUBLIC_KEY || GHL_DEFAULT_PUBLIC_KEY;
  if (pubKey) {
    try {
      const sigBuf = Buffer.from(provided, 'base64');
      if (sigBuf.length > 0 && crypto.verify('RSA-SHA256', body, pubKey, sigBuf)) {
        return { ok: true, reason: 'rsa-match' };
      }
    } catch {
      // fall through to HMAC
    }
  }

  // 2. HMAC shared-secret verification (workflow/custom webhooks).
  if (secret) {
    const expectedHex = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const expectedB64 = crypto.createHmac('sha256', secret).update(body).digest('base64');
    if (timingSafeEqualStr(provided, expectedHex)) return { ok: true, reason: 'hmac-hex' };
    if (timingSafeEqualStr(provided, expectedB64)) return { ok: true, reason: 'hmac-base64' };
  }

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
