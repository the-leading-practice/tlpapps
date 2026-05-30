/**
 * P09 T01 — GHL HMAC verification unit tests (no network, no DB).
 *
 * Proves: correct signature => verify ok (handler would 200); tampered body or wrong
 * secret => verify fails (middleware 401). Exercises the pure verifier and the Express
 * middleware with fake req/res.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  verifyGhlSignature,
  ghlSignatureMiddleware,
  GHL_SIGNATURE_HEADER,
} from '../../src/modules/webhooks/verify-ghl-signature.js';

const SECRET = 'test-shared-secret';
const BODY = Buffer.from(JSON.stringify({ type: 'AppointmentCreate', id: 'appt-1' }));
const sign = (body: Buffer, secret: string) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

test('verifyGhlSignature: correct hex signature => ok', () => {
  const r = verifyGhlSignature(BODY, sign(BODY, SECRET), SECRET);
  assert.equal(r.ok, true);
});

test('verifyGhlSignature: tampered body => mismatch', () => {
  const tampered = Buffer.from(JSON.stringify({ type: 'AppointmentCreate', id: 'EVIL' }));
  const r = verifyGhlSignature(tampered, sign(BODY, SECRET), SECRET);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'signature-mismatch');
});

test('verifyGhlSignature: wrong secret => mismatch', () => {
  const r = verifyGhlSignature(BODY, sign(BODY, 'other-secret'), SECRET);
  assert.equal(r.ok, false);
});

test('verifyGhlSignature: missing secret => fail closed', () => {
  const r = verifyGhlSignature(BODY, sign(BODY, SECRET), undefined);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-secret-configured');
});

function fakeRes() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
}

test('middleware: tampered body => 401', () => {
  process.env.GHL_WEBHOOK_SECRET = SECRET;
  const req: any = {
    rawBody: Buffer.from(JSON.stringify({ id: 'EVIL' })),
    header: (h: string) => (h === GHL_SIGNATURE_HEADER ? sign(BODY, SECRET) : undefined),
  };
  const res = fakeRes();
  let nextCalled = false;
  ghlSignatureMiddleware(req, res as any, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('middleware: correct sig => next() (would 200)', () => {
  process.env.GHL_WEBHOOK_SECRET = SECRET;
  const req: any = {
    rawBody: BODY,
    header: (h: string) => (h === GHL_SIGNATURE_HEADER ? sign(BODY, SECRET) : undefined),
  };
  const res = fakeRes();
  let nextCalled = false;
  ghlSignatureMiddleware(req, res as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 0);
});
