/**
 * EDGE-02 T03 — Nyquist coverage for ECLI-01/02/03 (mocked fetch, no live Edge calls).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
process.env.TOKEN_KEY = process.env.TOKEN_KEY || 'test-tlp-jwt-key-32bytes-padXXXX';

import { test } from 'node:test';
import assert from 'node:assert/strict';

function mockResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return {
    status,
    text: async () => body,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Response;
}

const noopSleep = async (_ms: number): Promise<void> => undefined;

test('ECLI-01: edgeHeaders yields X-API-Key; edgeFetch prefixes apiUrl and hits mock once on 200', async () => {
  const { edgeHeaders, edgeFetch } = await import('../../src/modules/edge/client.js');
  const { config } = await import('../../src/config.js');

  const headers = edgeHeaders('olx_test_token', false);
  assert.equal(headers['X-API-Key'], 'olx_test_token');

  let callCount = 0;
  let calledUrl = '';
  const mockFetch = async (url: string) => {
    callCount += 1;
    calledUrl = url;
    return mockResponse(200, JSON.stringify({ ok: true }));
  };

  const result = await edgeFetch(
    '/api/contacts?limit=1',
    { method: 'GET', fetchImpl: mockFetch as unknown as typeof fetch, sleepImpl: noopSleep },
    { token: 'olx_test_token', locationId: 'loc-1' },
  );

  assert.equal(callCount, 1);
  assert.equal(calledUrl, `${config.edge.apiUrl}/api/contacts?limit=1`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { ok: true });
});

test('ECLI-02: 429 with Retry-After then 200 retries and succeeds', async () => {
  const { edgeFetch } = await import('../../src/modules/edge/client.js');

  let callCount = 0;
  const mockFetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return mockResponse(429, 'rate limited', { 'Retry-After': '0' });
    }
    return mockResponse(200, JSON.stringify({ ok: true }));
  };

  const result = await edgeFetch(
    '/api/contacts?limit=1',
    { method: 'GET', fetchImpl: mockFetch as unknown as typeof fetch, sleepImpl: noopSleep },
    { token: 'olx_test_token', locationId: 'loc-429' },
  );

  assert.equal(callCount, 2);
  assert.equal(result.status, 200);
});

test('ECLI-02: 500 x N exhausts the retry cap; retry count matches cap', async () => {
  const { edgeFetch } = await import('../../src/modules/edge/client.js');

  let callCount = 0;
  const maxRetries = 3;
  const mockFetch = async () => {
    callCount += 1;
    return mockResponse(500, 'server error');
  };

  const result = await edgeFetch(
    '/api/contacts?limit=1',
    { method: 'GET', maxRetries, fetchImpl: mockFetch as unknown as typeof fetch, sleepImpl: noopSleep },
    { token: 'olx_test_token', locationId: 'loc-500' },
  );

  // Initial attempt + maxRetries retries = maxRetries + 1 total calls.
  assert.equal(callCount, maxRetries + 1);
  assert.equal(result.status, 500);
});

test('ECLI-02: two consecutive 401s fire the edge oauth_failure alert', async () => {
  const { edgeFetch, __setTriggerAlertForTests } = await import('../../src/modules/edge/client.js');

  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  __setTriggerAlertForTests((async (type: string, ctx?: Record<string, unknown>) => {
    calls.push([type, ctx]);
  }) as Parameters<typeof __setTriggerAlertForTests>[0]);

  const mockFetch = async () => mockResponse(401, 'unauthorized');
  const locationId = 'loc-401-alert';

  await edgeFetch(
    '/api/contacts?limit=1',
    { method: 'GET', maxRetries: 0, fetchImpl: mockFetch as unknown as typeof fetch, sleepImpl: noopSleep },
    { token: 'bad_token', locationId },
  );
  await edgeFetch(
    '/api/contacts?limit=1',
    { method: 'GET', maxRetries: 0, fetchImpl: mockFetch as unknown as typeof fetch, sleepImpl: noopSleep },
    { token: 'bad_token', locationId },
  );

  const oauthCalls = calls.filter(([type]) => type === 'oauth_failure');
  assert.equal(oauthCalls.length, 1);
  assert.equal(oauthCalls[0][1]?.system, 'edge');
  assert.equal(oauthCalls[0][1]?.locationId, locationId);
});

test('ECLI-03: non-/api/* path throws without invoking fetch', async () => {
  const { edgeFetch } = await import('../../src/modules/edge/client.js');

  let callCount = 0;
  const mockFetch = async () => {
    callCount += 1;
    return mockResponse(200, '{}');
  };

  await assert.rejects(
    edgeFetch(
      '/internal/secret',
      { method: 'GET', fetchImpl: mockFetch as unknown as typeof fetch, sleepImpl: noopSleep },
      { token: 'olx_test_token' },
    ),
  );

  assert.equal(callCount, 0);
});

test('edgeHealthCheck: exported as a function (connectivity probe wiring covered via edgeFetch tests above)', async () => {
  const { edgeHealthCheck } = await import('../../src/modules/edge/client.js');
  assert.equal(typeof edgeHealthCheck, 'function');
});
