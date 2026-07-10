/**
 * EDGE-07 T01 — verify-edge-signature.ts unit tests (Nyquist).
 *
 * Covers every <behavior> case: valid, bad signature, missing signature, missing
 * timestamp, skew, missing raw body, length-mismatched hex, missing secret.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyEdgeSignature } from '../../src/modules/webhooks/verify-edge-signature.js';

const SECRET = 'edge-test-secret';

function sign(timestamp: string, rawBody: Buffer, secret = SECRET): string {
  const signedBytes = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  return crypto.createHmac('sha256', secret).update(signedBytes).digest('hex');
}

test('valid signature within skew window -> ok', () => {
  const rawBody = Buffer.from(JSON.stringify({ event: 'edge.contact.changed', id: 'c1' }));
  const nowSec = 1_800_000_000;
  const timestamp = String(nowSec);
  const signature = `sha256=${sign(timestamp, rawBody)}`;
  const result = verifyEdgeSignature({ rawBody, signature, timestamp, secret: SECRET, nowSec });
  assert.equal(result.ok, true);
});

test('valid signature without sha256= prefix -> ok (prefix optional)', () => {
  const rawBody = Buffer.from('{}');
  const nowSec = 1_800_000_000;
  const timestamp = String(nowSec);
  const signature = sign(timestamp, rawBody);
  const result = verifyEdgeSignature({ rawBody, signature, timestamp, secret: SECRET, nowSec });
  assert.equal(result.ok, true);
});

test('bad signature (wrong secret) -> signature-mismatch', () => {
  const rawBody = Buffer.from('{}');
  const nowSec = 1_800_000_000;
  const timestamp = String(nowSec);
  const signature = `sha256=${sign(timestamp, rawBody, 'other-secret')}`;
  const result = verifyEdgeSignature({ rawBody, signature, timestamp, secret: SECRET, nowSec });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'signature-mismatch');
});

test('tampered body -> signature-mismatch', () => {
  const nowSec = 1_800_000_000;
  const timestamp = String(nowSec);
  const signature = `sha256=${sign(timestamp, Buffer.from('{"a":1}'))}`;
  const result = verifyEdgeSignature({
    rawBody: Buffer.from('{"a":2}'),
    signature,
    timestamp,
    secret: SECRET,
    nowSec,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'signature-mismatch');
});

test('missing signature -> missing-signature', () => {
  const result = verifyEdgeSignature({
    rawBody: Buffer.from('{}'),
    signature: undefined,
    timestamp: '1800000000',
    secret: SECRET,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-signature');
});

test('missing timestamp -> missing-timestamp', () => {
  const result = verifyEdgeSignature({
    rawBody: Buffer.from('{}'),
    signature: 'sha256=deadbeef',
    timestamp: undefined,
    secret: SECRET,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-timestamp');
});

test('skew > 300s -> timestamp-skew', () => {
  const nowSec = 1_800_000_000;
  const timestamp = String(nowSec - 301);
  const rawBody = Buffer.from('{}');
  const signature = `sha256=${sign(timestamp, rawBody)}`;
  const result = verifyEdgeSignature({ rawBody, signature, timestamp, secret: SECRET, nowSec });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timestamp-skew');
});

test('skew exactly 300s -> ok (inclusive boundary)', () => {
  const nowSec = 1_800_000_000;
  const timestamp = String(nowSec - 300);
  const rawBody = Buffer.from('{}');
  const signature = `sha256=${sign(timestamp, rawBody)}`;
  const result = verifyEdgeSignature({ rawBody, signature, timestamp, secret: SECRET, nowSec });
  assert.equal(result.ok, true);
});

test('missing raw body -> missing-raw-body', () => {
  const result = verifyEdgeSignature({
    rawBody: undefined,
    signature: 'sha256=deadbeef',
    timestamp: '1800000000',
    secret: SECRET,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-raw-body');
});

test('length-mismatched hex compared with timingSafeEqual -> no throw, signature-mismatch', () => {
  const result = verifyEdgeSignature({
    rawBody: Buffer.from('{}'),
    signature: 'sha256=short',
    timestamp: '1800000000',
    secret: SECRET,
    nowSec: 1_800_000_000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'signature-mismatch');
});

test('missing secret -> missing-secret (fail closed)', () => {
  const result = verifyEdgeSignature({
    rawBody: Buffer.from('{}'),
    signature: 'sha256=deadbeef',
    timestamp: '1800000000',
    secret: undefined,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-secret');
});
