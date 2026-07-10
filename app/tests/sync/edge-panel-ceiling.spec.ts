/**
 * EDGE-09 Plan 01 — Nyquist coverage for ECTL-01/02: the admin panel's edge
 * ceiling clamp. Imports envCeilingForDirection directly (pure function, no
 * DB/server needed) mirroring the existing tests/sync/edge-control.spec.ts style.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envCeilingForDirection } from '../../src/modules/sync/writers/dispatch.js';

const MODE_ORDER: Record<string, number> = { off: 0, dry: 1, verify: 2, on: 3 };

test('drchrono_to_edge: unset env -> off (fail-closed floor, NOT dry)', () => {
  assert.equal(envCeilingForDirection('drchrono_to_edge', {} as any), 'off');
});

test('edge_to_drchrono: unset env -> off (fail-closed floor, NOT dry)', () => {
  assert.equal(envCeilingForDirection('edge_to_drchrono', {} as any), 'off');
});

test('drchrono_to_edge: SYNC_WRITE_EDGE=dry -> dry; SYNC_WRITE_EDGE=on -> on', () => {
  assert.equal(envCeilingForDirection('drchrono_to_edge', { SYNC_WRITE_EDGE: 'dry' } as any), 'dry');
  assert.equal(envCeilingForDirection('drchrono_to_edge', { SYNC_WRITE_EDGE: 'on' } as any), 'on');
});

test('drchrono_to_edge: garbage env value -> off (fail-closed on garbage, not just unset)', () => {
  assert.equal(envCeilingForDirection('drchrono_to_edge', { SYNC_WRITE_EDGE: 'garbage' } as any), 'off');
});

test('edge_to_drchrono: SYNC_WRITE_EDGE_TO_DRCHRONO=verify -> verify', () => {
  assert.equal(
    envCeilingForDirection('edge_to_drchrono', { SYNC_WRITE_EDGE_TO_DRCHRONO: 'verify' } as any),
    'verify',
  );
});

test('simulated PATCH above ceiling is rejected: ceiling=off, any requested mode !== off exceeds it', () => {
  const ceiling = envCeilingForDirection('drchrono_to_edge', {} as any);
  assert.equal(ceiling, 'off');
  // Mirrors routes.ts's `if (MODE_ORDER[mode] > MODE_ORDER[ceiling]) -> 409` gate.
  assert.ok(MODE_ORDER['on'] > MODE_ORDER[ceiling], 'on must exceed off ceiling');
  assert.ok(MODE_ORDER['dry'] > MODE_ORDER[ceiling], 'dry must exceed off ceiling');
});

test('legacy drchrono_to_ghl / ghl_to_drchrono ceilings unaffected by the refactor (still default dry)', () => {
  assert.equal(envCeilingForDirection('drchrono_to_ghl', {} as any), 'dry');
  assert.equal(
    envCeilingForDirection('ghl_to_drchrono', { SYNC_WRITE_GHL_TO_DRCHRONO: 'off' } as any),
    'off',
  );
});
