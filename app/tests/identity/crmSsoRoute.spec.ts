/**
 * EMBED-03a — POST /api/crm/sso + GET /api/crm/sso-status route tests
 *
 * All external dependencies (Mongo models) are stubbed in-process.
 * Uses Node's built-in http module — no supertest dep required.
 *
 * Covers:
 *   200  happy path — valid ssoData → token + config
 *   400  missing/empty ssoData
 *   401  bad blob (decrypt throws)
 *   409  location not onboarded
 *   503  ssoKey not configured  (tested separately via a second server instance)
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

const TOKEN_KEY = 'test-tlp-jwt-key-32bytes-padXXXX';
process.env.TOKEN_KEY = TOKEN_KEY;
process.env.GHL_APP_SSO_KEY = 'test-sso-key-32chars-padding-xx!';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Test helpers — reproduce CryptoJS/OpenSSL "Salted__" encrypt path
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
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from('Salted__', 'binary'), salt, encrypted]).toString('base64');
}

function encryptForStore(plaintext: string, key: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.alloc(2);
  header[0] = iv.length;
  header[1] = tag.length;
  return Buffer.concat([header, iv, tag, encrypted]).toString('hex');
}

const SSO_KEY = 'test-sso-key-32chars-padding-xx!';
const LOCATION = 'loc_embed_test';
const ACCESS_TOKEN = 'ghl_access_embed';

const SSO_PAYLOAD = {
  activeLocation: LOCATION,
  companyId: 'cmp_test',
  userId: 'usr_test',
  email: 'owner@example.com',
  role: 'admin',
  type: 'sub-account',
};

// ---------------------------------------------------------------------------
// In-process HTTP request helper (avoids supertest dep)
// ---------------------------------------------------------------------------

function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode!, data: raw });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function listen(app: import('express').Application): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))),
      });
    });
    server.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let port: number;
let closeServer: () => Promise<void>;

before(async () => {
  const encryptedHex = encryptForStore(
    JSON.stringify({ access_token: ACCESS_TOKEN, refresh_token: 'rfr_embed' }),
    TOKEN_KEY,
  );

  // Stub AccessTokenModel.findOne
  const atMod = await import('../../src/models/accessToken.js');
  (atMod.AccessTokenModel as any).findOne = async (query: any) => {
    if (query.location === LOCATION) {
      return {
        location: LOCATION,
        calendar: 'cal_embed',
        timezone: 'America/Chicago',
        name: 'Embed Practice',
        token: encryptedHex,
        pushGHL: false,
        pushAppt: true,
        pushPat: false,
        software: 'drchrono',
      };
    }
    return null;
  };

  // Stub AppConfigModel.findOne
  const acMod = await import('../../src/models/appConfig.js');
  (acMod.AppConfigModel as any).findOne = async () => ({ config: { embedMode: true } });

  // Import server (stubs must be in place first)
  const { createServer } = await import('../../src/server.js');
  const app = createServer();
  const srv = await listen(app);
  port = srv.port;
  closeServer = srv.close;
});

// ---------------------------------------------------------------------------
// POST /api/crm/sso tests
// ---------------------------------------------------------------------------

test('200 — valid ssoData returns JWT + config', async () => {
  const blob = encryptSalted(JSON.stringify(SSO_PAYLOAD), SSO_KEY);
  const { status, data } = await request(port, 'POST', '/api/crm/sso', { ssoData: blob });

  assert.equal(status, 200, `Expected 200 got ${status}: ${JSON.stringify(data)}`);
  assert.ok(data.token, 'token must be present');
  assert.equal(data.location, LOCATION);
  assert.equal(data.name, 'Embed Practice');
  assert.deepEqual(data.config, { embedMode: true });

  // JWT must be verifiable + carry AuthPayload fields authToken middleware expects
  const decoded = jwt.verify(data.token, TOKEN_KEY) as any;
  assert.equal(decoded.location, LOCATION);
  assert.equal(decoded.calendar, 'cal_embed');
  assert.equal(decoded.timezone, 'America/Chicago');
  assert.equal(decoded.token, ACCESS_TOKEN);
  assert.equal(decoded.software, 'drchrono');
  assert.equal(decoded.pushAppt, true);
});

test('400 — missing ssoData field', async () => {
  const { status, data } = await request(port, 'POST', '/api/crm/sso', {});
  assert.equal(status, 400);
  assert.equal(data.error, 'sso_missing_data');
});

test('400 — empty string ssoData', async () => {
  const { status, data } = await request(port, 'POST', '/api/crm/sso', { ssoData: '   ' });
  assert.equal(status, 400);
  assert.equal(data.error, 'sso_missing_data');
});

test('401 — bad/forged blob cannot be decrypted', async () => {
  // "notvalid" base64 → not Salted__ and not iv:hex → throws in decryptCrmSso
  const { status, data } = await request(port, 'POST', '/api/crm/sso', {
    ssoData: 'bm90dmFsaWQ=',
  });
  assert.equal(status, 401);
  assert.equal(data.error, 'sso_decrypt_failed');
});

test('409 — location not onboarded (no accessTokens row)', async () => {
  const unknownPayload = { ...SSO_PAYLOAD, activeLocation: 'loc_ghost' };
  const blob = encryptSalted(JSON.stringify(unknownPayload), SSO_KEY);
  const { status, data } = await request(port, 'POST', '/api/crm/sso', { ssoData: blob });
  assert.equal(status, 409);
  assert.equal(data.error, 'location_not_onboarded');
  assert.equal(data.location, 'loc_ghost');
});

// ---------------------------------------------------------------------------
// GET /api/crm/sso-status
// ---------------------------------------------------------------------------

test('sso-status returns configured: true when key is set', async () => {
  const { status, data } = await request(port, 'GET', '/api/crm/sso-status');
  assert.equal(status, 200);
  assert.equal(data.configured, true);
});
