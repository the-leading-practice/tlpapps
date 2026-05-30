/**
 * P09 T02/T05 — deterministic dedup_key unit tests (no DB).
 *
 * Proves the dedup key is stable across key-ordering, distinct across action/id, and
 * falls back to a payload hash when no version is supplied. The live "replay twice =>
 * one row" assertion needs Postgres and is covered by the deferred DB idempotency test.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupKey } from '../../src/modules/sync/ingest.js';

test('dedupKey: stable across object key ordering', () => {
  const a = dedupKey({ source: 'ghl', action: 'created', externalId: 'x1', payload: { a: 1, b: 2 } });
  const b = dedupKey({ source: 'ghl', action: 'created', externalId: 'x1', payload: { b: 2, a: 1 } });
  assert.equal(a, b);
});

test('dedupKey: same webhook twice => identical key (dedup target)', () => {
  const p = { id: 'appt-9', startTime: '2026-06-01T15:00:00Z' };
  const k1 = dedupKey({ source: 'drchrono', action: 'APPOINTMENT_CREATE', externalId: 'appt-9', payload: p });
  const k2 = dedupKey({ source: 'drchrono', action: 'APPOINTMENT_CREATE', externalId: 'appt-9', payload: p });
  assert.equal(k1, k2);
});

test('dedupKey: differs by action and external id', () => {
  const base = { source: 'ghl', externalId: 'x', payload: {} };
  assert.notEqual(
    dedupKey({ ...base, action: 'created' }),
    dedupKey({ ...base, action: 'updated' }),
  );
  assert.notEqual(
    dedupKey({ source: 'ghl', action: 'created', externalId: 'a', payload: {} }),
    dedupKey({ source: 'ghl', action: 'created', externalId: 'b', payload: {} }),
  );
});

test('dedupKey: explicit version overrides payload hash', () => {
  const withVer = dedupKey({ source: 'ghl', action: 'updated', externalId: 'x', payload: { a: 1 }, version: 7 });
  assert.ok(withVer.endsWith(':7'));
});
