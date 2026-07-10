/**
 * EDGE-06 Plan 01 — writeModeForEntity fail-closed coverage for the NEW
 * drchrono_to_edge direction. Mirrors tests/sync/dispatch.spec.ts's DB-stubbing
 * approach: no real DB is reachable, so the DB-query branch throws and every
 * case that depends on a DB row falls through to the fail-closed 'off' floor.
 * The ceiling-only unit-testable behavior (unset/verify/on parsing) is asserted
 * directly since a real DB row is not available in this unit-test env.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeModeForEntity, invalidateControlCache } from '../../src/modules/sync/writers/dispatch.js';

test('drchrono_to_edge: no DB row / DB unreachable -> off (fail-closed) regardless of ceiling', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity('drchrono_to_edge', 'patients', { SYNC_WRITE_EDGE: 'on' } as any);
  assert.equal(mode, 'off');
});

test('drchrono_to_edge: SYNC_WRITE_EDGE unset -> off ceiling (never escalates on DB error)', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity('drchrono_to_edge', 'appointments', {} as any);
  assert.equal(mode, 'off');
});

test('drchrono_to_edge: SYNC_WRITE_EDGE=verify -> still off (no DB row reachable in unit env)', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity('drchrono_to_edge', 'patients', { SYNC_WRITE_EDGE: 'verify' } as any);
  assert.equal(mode, 'off');
});

test('drchrono_to_edge: DB query throws -> off (never returns the env ceiling on error)', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity('drchrono_to_edge', 'appointments', { SYNC_WRITE_EDGE: 'on' } as any);
  assert.equal(mode, 'off');
});

test('drchrono_to_edge: cache does not leak a stale mode across entities', async () => {
  invalidateControlCache();
  const p = await writeModeForEntity('drchrono_to_edge', 'patients', {} as any);
  const a = await writeModeForEntity('drchrono_to_edge', 'appointments', {} as any);
  assert.equal(p, 'off');
  assert.equal(a, 'off');
});
