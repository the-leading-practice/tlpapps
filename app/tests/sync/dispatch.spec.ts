/**
 * P09 T04 — kill-switch dispatch unit tests with MOCK writer http.
 *
 * Proves the engine-facing contract: dry => writer never called; on => writer called
 * exactly once; off => skipped + counter increment. No network, no DB.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchWrite,
  writeModeFor,
  counters,
} from '../../src/modules/sync/writers/dispatch.js';
import type { AttemptResult } from '../../src/modules/sync/writers/shared.js';

function mockHttp() {
  let calls = 0;
  const fn = async (): Promise<AttemptResult> => {
    calls++;
    return { status: 200, data: { ok: true } };
  };
  return { fn, get calls() { return calls; } };
}

test('writeModeFor: off | dry | on resolution', () => {
  assert.equal(writeModeFor('ghl', { SYNC_WRITE_DRCHRONO_TO_GHL: 'on' } as any), 'on');
  assert.equal(writeModeFor('ghl', { SYNC_WRITE_DRCHRONO_TO_GHL: 'off' } as any), 'off');
  assert.equal(writeModeFor('ghl', {} as any), 'dry');
  assert.equal(writeModeFor('drchrono', { SYNC_WRITE_GHL_TO_DRCHRONO: 'on' } as any), 'on');
});

test('dispatch dry => no writer call', async () => {
  const m = mockHttp();
  const outcome = await dispatchWrite(
    { eventId: 'e1', target: 'ghl', entity: 'appointment', verb: 'create', body: {} },
    { mode: 'dry', ghlHttp: m.fn, retryDelayFactor: 0 },
  );
  assert.equal(outcome, 'dry-logged');
  assert.equal(m.calls, 0);
});

test('dispatch on => writer called once', async () => {
  const m = mockHttp();
  const outcome = await dispatchWrite(
    { eventId: 'e2', target: 'ghl', entity: 'appointment', verb: 'create', token: 'tok', body: {} },
    { mode: 'on', ghlHttp: m.fn, retryDelayFactor: 0 },
  );
  assert.equal(outcome, 'written');
  assert.equal(m.calls, 1);
});

test('dispatch on without token => refuses live write (treated as dry)', async () => {
  const m = mockHttp();
  const outcome = await dispatchWrite(
    { eventId: 'e3', target: 'ghl', entity: 'appointment', verb: 'create', body: {} },
    { mode: 'on', ghlHttp: m.fn, retryDelayFactor: 0 },
  );
  assert.equal(outcome, 'dry-logged');
  assert.equal(m.calls, 0);
});

test('dispatch off => skipped + counter increment', async () => {
  const before = counters.sync_writes_skipped_off;
  const m = mockHttp();
  const outcome = await dispatchWrite(
    { eventId: 'e4', target: 'drchrono', entity: 'appointment', verb: 'update', body: {} },
    { mode: 'off', dcHttp: m.fn, retryDelayFactor: 0 },
  );
  assert.equal(outcome, 'skipped-off');
  assert.equal(m.calls, 0);
  assert.equal(counters.sync_writes_skipped_off, before + 1);
});
