/**
 * P09 T03 — writer unit tests with MOCK http (no network, no live EHR).
 *
 * Proves: success path returns 2xx; 5xx triggers retry then eventual success; permanent
 * 5xx exhausts retries, dead-letters, and throws WriteError. Idempotency-Key + origin
 * tag are present on the outbound request.
 *
 * A dummy DATABASE_URL is set so the shared module's db client import succeeds; the
 * dead-letter DB insert will fail to connect but is caught (best-effort) — the writer
 * still throws, which is the assertion. retryDelayFactor 0 disables real backoff sleeps.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
// Ensure dead-letter Telegram alert stays suppressed (no write direction on).
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ghlWrite, routeFor } from '../../src/modules/sync/writers/ghl.js';
import { drchronoWrite } from '../../src/modules/sync/writers/drchrono.js';
import { WriteError, type AttemptResult } from '../../src/modules/sync/writers/shared.js';

/** Build a mock http fn that returns the queued statuses in order, recording calls. */
function mockHttp(statuses: number[]) {
  const calls: { url: string; options: RequestInit }[] = [];
  let i = 0;
  const fn = async (url: string, options: RequestInit): Promise<AttemptResult> => {
    calls.push({ url, options });
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    return { status, data: status < 300 ? { ok: true } : 'err' };
  };
  return { fn, calls };
}

test('ghlWrite: success path => 2xx, idempotency-key + origin tag present', async () => {
  const { fn, calls } = mockHttp([200]);
  const res = await ghlWrite(
    { eventId: 'ev-1', entity: 'appointment', verb: 'create', token: 'tok', body: { x: 1 } },
    fn,
    { delayFactor: 0 },
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const headers = calls[0].options.headers as Record<string, string>;
  assert.ok(headers['Idempotency-Key'].includes('ev-1'));
  const body = JSON.parse(calls[0].options.body as string);
  assert.equal(body.origin_tag, 'tlp-sync:ghl:ev-1');
});

test('ghlWrite: 5xx then 200 => retries then succeeds', async () => {
  const { fn, calls } = mockHttp([503, 200]);
  const res = await ghlWrite(
    { eventId: 'ev-2', entity: 'appointment', verb: 'update', id: 'a1', token: 't', body: {} },
    fn,
    { delayFactor: 0 },
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test('ghlWrite: permanent 5xx => exhausts retries + throws WriteError', async () => {
  const { fn, calls } = mockHttp([500]);
  await assert.rejects(
    ghlWrite(
      { eventId: 'ev-3', entity: 'appointment', verb: 'create', token: 't', body: {} },
      fn,
      { delayFactor: 0 },
    ),
    (err: unknown) => err instanceof WriteError && err.status === 500,
  );
  assert.equal(calls.length, 4); // 1 + MAX_RETRIES(3)
});

test('ghlWrite: 4xx (non-retryable) => single attempt then WriteError', async () => {
  const { fn, calls } = mockHttp([400]);
  await assert.rejects(
    ghlWrite({ eventId: 'ev-4', entity: 'contact', verb: 'update', id: 'c1', token: 't', body: {} }, fn, {
      delayFactor: 0,
    }),
    (err: unknown) => err instanceof WriteError,
  );
  assert.equal(calls.length, 1);
});

test('drchronoWrite: cancel sets status + notes origin tag', async () => {
  const { fn, calls } = mockHttp([200]);
  await drchronoWrite(
    { eventId: 'ev-5', entity: 'appointment', verb: 'cancel', id: 'd1', token: 't', body: {} },
    fn,
    { delayFactor: 0 },
  );
  const body = JSON.parse(calls[0].options.body as string);
  assert.equal(body.status, 'Cancelled');
  assert.ok(String(body.notes).includes('tlp-sync:drchrono:ev-5'));
});

test('routeFor: ghl appointment cancel => PUT with cancelled status', () => {
  const r = routeFor({ eventId: 'e', entity: 'appointment', verb: 'cancel', id: 'a1', token: 't', body: {} });
  assert.equal(r.method, 'PUT');
  assert.equal((r.body as Record<string, unknown>).appointmentStatus, 'cancelled');
});
