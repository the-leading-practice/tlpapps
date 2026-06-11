/**
 * EMBED-03b — SSE activity stream ?token= auth tests
 *
 * Verifies that GET /api/sync/activity/stream accepts a valid JWT via the
 * `?token=` query parameter (needed because EventSource cannot send headers),
 * while invalid/absent tokens still yield 401.
 *
 * The SSE handler itself is tested only to the auth layer — we don't need a
 * real PG connection because auth rejects before any DB call.
 *
 * Approach: spin up the Express app on an ephemeral port and make raw HTTP
 * GET requests to inspect the status code from the first chunk.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

const TOKEN_KEY = 'test-tlp-jwt-key-32bytes-padXXXX';
process.env.TOKEN_KEY = TOKEN_KEY;
process.env.GHL_APP_SSO_KEY = 'test-sso-key-32chars-padding-xx!';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Minimal JWT matching the AuthPayload contract
// ---------------------------------------------------------------------------

function mintJwt(location = 'loc_sse_test'): string {
  return jwt.sign(
    {
      location,
      calendar: 'cal_sse',
      timezone: 'UTC',
      name: 'SSE Practice',
      token: 'ghl_access_sse',
      pushGHL: false,
      pushAppt: false,
      pushPat: false,
      software: 'drchrono',
    },
    TOKEN_KEY,
    { expiresIn: '86400s' },
  );
}

// ---------------------------------------------------------------------------
// In-process HTTP helper — return status + destroy immediately (don't consume SSE stream)
// ---------------------------------------------------------------------------

function getStatus(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      resolve(res.statusCode!);
      res.destroy(); // don't wait for the SSE stream to close
    });
    req.on('error', reject);
  });
}

let port: number;
let server: http.Server;

before(async () => {
  // Stub Mongo models so the server boots cleanly without a real DB
  const atMod = await import('../../src/models/accessToken.js');
  (atMod.AccessTokenModel as any).findOne = async () => null;

  const acMod = await import('../../src/models/appConfig.js');
  (acMod.AppConfigModel as any).findOne = async () => null;

  const { createServer } = await import('../../src/server.js');
  const app = createServer();

  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
    server.on('error', reject);
  });
});

after(
  () =>
    new Promise<void>((res, rej) => {
      server.close((e) => (e ? rej(e) : res()));
    }),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('SSE stream: valid JWT via ?token= → 200 (text/event-stream)', async () => {
  const token = mintJwt();
  const status = await getStatus(port, `/api/sync/activity/stream?token=${encodeURIComponent(token)}`);
  assert.equal(status, 200, `Expected 200, got ${status}`);
});

test('SSE stream: no token → 401', async () => {
  const status = await getStatus(port, '/api/sync/activity/stream');
  assert.equal(status, 401, `Expected 401, got ${status}`);
});

test('SSE stream: invalid/tampered JWT via ?token= → 403', async () => {
  const status = await getStatus(
    port,
    '/api/sync/activity/stream?token=eyJhbGciOiJIUzI1NiJ9.eyJsb2NhdGlvbiI6IngiLCJjYWxlbmRhciI6IngiLCJ0aW1lem9uZSI6IngiLCJuYW1lIjoieCIsInRva2VuIjoieCIsInB1c2hHSEwiOmZhbHNlLCJwdXNoQXBwdCI6ZmFsc2UsInB1c2hQYXQiOmZhbHNlLCJzb2Z0d2FyZSI6IngiLCJpYXQiOjE3MDAwMDAwMDB9.TAMPERED',
  );
  assert.equal(status, 403, `Expected 403, got ${status}`);
});

test('SSE stream: valid JWT in Authorization header still works', async () => {
  const token = mintJwt();
  const status = await new Promise<number>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/sync/activity/stream',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        resolve(res.statusCode!);
        res.destroy();
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 200, `Expected 200, got ${status}`);
});

test('SSE stream: ?token= is NOT accepted for POST (mutation route)', async () => {
  // Use a mutating route that requires auth — sync/conflicts/:id/resolve.
  // Even with a valid ?token=, a POST must use the Authorization header.
  const token = mintJwt();
  const status = await new Promise<number>((resolve, reject) => {
    const body = JSON.stringify({ decision: 'skip' });
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        // Use a non-existent id so the route handler doesn't touch DB;
        // the auth check happens BEFORE the handler, so 401 vs 404 tells us.
        path: `/api/sync/conflicts/fake-id/resolve?token=${encodeURIComponent(token)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        resolve(res.statusCode!);
        res.destroy();
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  // Without an Authorization header, a POST with only ?token= must be rejected.
  assert.equal(status, 401, `Expected 401 (POST must not accept ?token=), got ${status}`);
});
