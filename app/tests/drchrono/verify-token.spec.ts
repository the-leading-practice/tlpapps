/**
 * DrChrono webhook verification challenge — HMAC token derivation.
 *
 * DrChrono verifies a webhook by GET ?msg=<token>; the endpoint must return
 * { secret_token: HMAC_SHA256_hex(msg, <Secret Token>) }. This proves the pure
 * HMAC core matches an independently-computed digest and is stable/deterministic.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { drchronoVerifyToken } from '../../src/modules/drchrono/webhook.js';

test('drchronoVerifyToken: matches independent HMAC-SHA256 hex', () => {
  const msg = 'challenge-abc-123';
  const secret = 'super-secret-token';
  const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  assert.equal(drchronoVerifyToken(msg, secret), expected);
});

test('drchronoVerifyToken: deterministic + 64-hex-char digest', () => {
  const a = drchronoVerifyToken('m', 's');
  const b = drchronoVerifyToken('m', 's');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('drchronoVerifyToken: different secret => different token', () => {
  assert.notEqual(drchronoVerifyToken('m', 's1'), drchronoVerifyToken('m', 's2'));
});
