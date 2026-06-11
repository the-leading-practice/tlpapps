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

test('writeModeFor: off | dry | verify | on resolution', () => {
  assert.equal(writeModeFor('ghl', { SYNC_WRITE_DRCHRONO_TO_GHL: 'on' } as any), 'on');
  assert.equal(writeModeFor('ghl', { SYNC_WRITE_DRCHRONO_TO_GHL: 'off' } as any), 'off');
  assert.equal(writeModeFor('ghl', { SYNC_WRITE_DRCHRONO_TO_GHL: 'verify' } as any), 'verify');
  assert.equal(writeModeFor('ghl', {} as any), 'dry');
  assert.equal(writeModeFor('drchrono', { SYNC_WRITE_GHL_TO_DRCHRONO: 'on' } as any), 'on');
  assert.equal(writeModeFor('drchrono', { SYNC_WRITE_GHL_TO_DRCHRONO: 'verify' } as any), 'verify');
});

const EHR_BASES = ['drchrono.com', 'leadconnectorhq.com'];
const hitsEhr = (url: string) => EHR_BASES.some((b) => url.includes(b));

test('dispatch verify (drchrono->ghl): EHR never hit, sink hit once, outcome verified, no token', async () => {
  // The injected writer http records every URL it is asked to fetch. In verify mode the
  // writer is handed the SINK http, so the only URL it ever sees is the sink — never GHL.
  const seen: string[] = [];
  const ghlHttp = async (url: string): Promise<AttemptResult> => {
    seen.push(url);
    return { status: 200, data: { captured: true } };
  };
  const outcome = await dispatchWrite(
    { eventId: 'v1', target: 'ghl', entity: 'contact', verb: 'create', locationId: 'DEMO_LOC_TEST', body: { name: 'A' } },
    { mode: 'verify', ghlHttp, retryDelayFactor: 0 },
  );
  assert.equal(outcome, 'verified');
  assert.equal(seen.length, 1); // sink POSTed exactly once
  assert.equal(seen.filter(hitsEhr).length, 0); // EHR base never hit
  assert.ok(seen[0].includes('/api/sync/verify-sink'));
});

test('dispatch verify (ghl->drchrono): EHR never hit, sink hit once, outcome verified, no token', async () => {
  // NOTE: appointment verify-mode is blocked by WR-06 guard. Use patient entity
  // for the ghl→drchrono path to test the verify path is network-isolated.
  const seen: string[] = [];
  const dcHttp = async (url: string): Promise<AttemptResult> => {
    seen.push(url);
    return { status: 200, data: { captured: true } };
  };
  const outcome = await dispatchWrite(
    { eventId: 'v2', target: 'drchrono', entity: 'patient', verb: 'update', id: 'd1', locationId: 'DEMO_LOC_TEST', body: {} },
    { mode: 'verify', dcHttp, retryDelayFactor: 0 },
  );
  assert.equal(outcome, 'verified');
  assert.equal(seen.length, 1);
  assert.equal(seen.filter(hitsEhr).length, 0);
  assert.ok(seen[0].includes('/api/sync/verify-sink'));
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

test('dispatch on => writer called once (contact entity)', async () => {
  // NOTE: appointment on-mode is blocked by WR-06 guard until loop tag is implemented.
  // Use contact entity here to test the on-mode path.
  const m = mockHttp();
  const outcome = await dispatchWrite(
    { eventId: 'e2', target: 'ghl', entity: 'contact', verb: 'create', token: 'tok', locationId: 'DEMO_LOC_TEST', body: {} },
    { mode: 'on', ghlHttp: m.fn, retryDelayFactor: 0 },
  );
  assert.equal(outcome, 'written');
  assert.equal(m.calls, 1);
});

test('dispatch on without token => refuses live write (treated as dry)', async () => {
  const m = mockHttp();
  const outcome = await dispatchWrite(
    { eventId: 'e3', target: 'ghl', entity: 'appointment', verb: 'create', locationId: 'DEMO_LOC_TEST', body: {} },
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
