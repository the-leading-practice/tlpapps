/**
 * EMBED-01 — decryptCrmSso unit tests
 *
 * The "Salted__" fixture is generated inline using the identical EVP_BytesToKey +
 * AES-256-CBC scheme the implementation uses (same as CryptoJS.AES.encrypt).
 * This is a true round-trip — encrypt path runs in test setup, decrypt path is the
 * function under test. No network, no real key required.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { decryptCrmSso } from '../../src/utils/crmSso.js';

// ---------------------------------------------------------------------------
// Test helpers — reproduce the CryptoJS/OpenSSL "Salted__" encrypt path so
// the round-trip test uses no external tools and no committed binary fixture.
// ---------------------------------------------------------------------------

function evpBytesToKey(password: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  const keyLen = 32;
  const ivLen = 16;
  const target = keyLen + ivLen;
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < target) {
    block = crypto
      .createHash('md5')
      .update(Buffer.concat([block, Buffer.from(password, 'utf8'), salt]))
      .digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, keyLen + ivLen) };
}

function encryptSalted(plaintext: string, password: string): string {
  const salt = crypto.randomBytes(8);
  const { key, iv } = evpBytesToKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  // OpenSSL salted format: "Salted__" (8 bytes) + salt (8 bytes) + ciphertext
  const header = Buffer.from('Salted__', 'binary');
  return Buffer.concat([header, salt, encrypted]).toString('base64');
}

function encryptHexFormat(plaintext: string, password: string): string {
  const iv = crypto.randomBytes(16);
  const keyBuffer = Buffer.from(password, 'utf8').subarray(0, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TEST_KEY = 'test-sso-key-32chars-padding-xx!';

const PAYLOAD = {
  activeLocation: 'loc_abc123',
  companyId: 'cmp_xyz',
  userId: 'usr_111',
  email: 'owner@example.com',
  role: 'admin',
  type: 'sub-account',
};

test('decryptCrmSso: Salted__ format round-trip', () => {
  const blob = encryptSalted(JSON.stringify(PAYLOAD), TEST_KEY);
  const result = decryptCrmSso(blob, TEST_KEY);
  assert.equal(result.activeLocation, PAYLOAD.activeLocation);
  assert.equal(result.companyId, PAYLOAD.companyId);
  assert.equal(result.userId, PAYLOAD.userId);
  assert.equal(result.email, PAYLOAD.email);
  assert.equal(result.role, PAYLOAD.role);
});

test('decryptCrmSso: Salted__ format is deterministic across multiple encryptions', () => {
  // Different salts each time but decryption must yield same payload
  const blob1 = encryptSalted(JSON.stringify(PAYLOAD), TEST_KEY);
  const blob2 = encryptSalted(JSON.stringify(PAYLOAD), TEST_KEY);
  // blobs differ (random salt) but both decrypt correctly
  assert.notEqual(blob1, blob2);
  assert.equal(decryptCrmSso(blob1, TEST_KEY).activeLocation, PAYLOAD.activeLocation);
  assert.equal(decryptCrmSso(blob2, TEST_KEY).activeLocation, PAYLOAD.activeLocation);
});

test('decryptCrmSso: iv:hex fallback format round-trip', () => {
  const blob = encryptHexFormat(JSON.stringify(PAYLOAD), TEST_KEY);
  const result = decryptCrmSso(blob, TEST_KEY);
  assert.equal(result.activeLocation, PAYLOAD.activeLocation);
});

test('decryptCrmSso: wrong key throws', () => {
  const blob = encryptSalted(JSON.stringify(PAYLOAD), TEST_KEY);
  assert.throws(() => decryptCrmSso(blob, 'wrong-key-completely-different!!'));
});

test('decryptCrmSso: non-Salted non-hex blob throws', () => {
  assert.throws(() => decryptCrmSso('notvalidbase64orhex', TEST_KEY));
});

test('decryptCrmSso: truncated Salted__ blob (< 16 bytes) throws', () => {
  // A valid base64 string that decodes to < 16 bytes — not enough for header+salt
  const short = Buffer.from('Salted_').toString('base64'); // 7 bytes, no salt
  assert.throws(() => decryptCrmSso(short, TEST_KEY));
});

test('decryptCrmSso: empty ssoData throws', () => {
  assert.throws(() => decryptCrmSso('', TEST_KEY));
});

test('decryptCrmSso: empty key throws', () => {
  const blob = encryptSalted(JSON.stringify(PAYLOAD), TEST_KEY);
  assert.throws(() => decryptCrmSso(blob, ''));
});
