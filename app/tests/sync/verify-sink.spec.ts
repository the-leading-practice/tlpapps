/**
 * P05 verify mode — makeSinkHttp envelope tests (no network, no DB, no live EHR).
 *
 * Proves the sink injector: builds the correct envelope (redacts Authorization,
 * parses JSON body, carries direction + eventId + url + method), POSTs it to the
 * sink URL via the injected http fn, and returns a synthetic 200.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSinkHttp, type SinkEnvelope } from '../../src/modules/sync/writers/verify-sink.js';
import type { AttemptResult } from '../../src/modules/sync/writers/shared.js';

function captureHttp() {
  const calls: { url: string; options: RequestInit }[] = [];
  const fn = async (url: string, options: RequestInit): Promise<AttemptResult> => {
    calls.push({ url, options });
    return { status: 200, data: { captured: true } };
  };
  return { fn, calls };
}

test('makeSinkHttp: builds envelope, redacts auth, parses body, returns synthetic 200', async () => {
  const sink = captureHttp();
  const http = makeSinkHttp({
    sinkUrl: 'http://sink.local/api/sync/verify-sink',
    direction: 'drchrono→ghl',
    eventId: 'ev-42',
    http: sink.fn,
  });

  const targetUrl = 'https://services.leadconnectorhq.com/contacts/upsert';
  const res = await http(targetUrl, {
    method: 'POST',
    headers: {
      authorization: 'Bearer super-secret-token',
      version: '2021-07-28',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'tlp-sync:ghl:contact:create:ev-42',
    },
    body: JSON.stringify({ name: 'Jane', origin_tag: 'tlp-sync:ghl:ev-42' }),
  });

  // Synthetic success so writer retry logic proceeds.
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { captured: true });

  // POSTed exactly once, to the sink (NOT the EHR target).
  assert.equal(sink.calls.length, 1);
  assert.equal(sink.calls[0].url, 'http://sink.local/api/sync/verify-sink');
  assert.notEqual(sink.calls[0].url, targetUrl);

  const env = JSON.parse(sink.calls[0].options.body as string) as SinkEnvelope;
  assert.equal(env.direction, 'drchrono→ghl');
  assert.equal(env.eventId, 'ev-42');
  assert.equal(typeof env.capturedAt, 'string');
  assert.equal(env.wouldHaveSent.url, targetUrl);
  assert.equal(env.wouldHaveSent.method, 'POST');
  // Authorization redacted; other headers intact.
  assert.equal(env.wouldHaveSent.headers.authorization, 'Bearer ***');
  assert.equal(env.wouldHaveSent.headers.version, '2021-07-28');
  assert.equal(env.wouldHaveSent.headers['Idempotency-Key'], 'tlp-sync:ghl:contact:create:ev-42');
  // Body parsed back to an object.
  const body = env.wouldHaveSent.body as Record<string, unknown>;
  assert.equal(body.name, 'Jane');
  assert.equal(body.origin_tag, 'tlp-sync:ghl:ev-42');
});

test('makeSinkHttp: redacts capitalized Authorization header too', async () => {
  const sink = captureHttp();
  const http = makeSinkHttp({
    sinkUrl: 'http://sink.local/s',
    direction: 'ghl→drchrono',
    eventId: 'ev-7',
    http: sink.fn,
  });
  await http('https://drchrono.com/api/appointments/1', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer abc', 'Idempotency-Key': 'k' },
    body: JSON.stringify({ status: 'Cancelled' }),
  });
  const env = JSON.parse(sink.calls[0].options.body as string) as SinkEnvelope;
  assert.equal(env.wouldHaveSent.headers.Authorization, 'Bearer ***');
  assert.equal(env.direction, 'ghl→drchrono');
});
