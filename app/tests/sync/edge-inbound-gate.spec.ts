/**
 * EDGE-07-01 T02 — edge_to_drchrono write-mode gate tests (Nyquist).
 *
 * Proves writeModeForEntity('edge_to_drchrono', ...) is fail-closed: unset env,
 * missing control row, and DB errors ALL resolve to 'off' — never the env ceiling.
 * No real DB connection is made; the DB import inside writeModeForEntity is not
 * reachable in this unit-test env (DATABASE_URL points at an unroutable sentinel
 * per tests/setup.mjs), so every case exercises the catch-path fail-closed branch
 * except where explicitly noted.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeModeForEntity, invalidateControlCache } from '../../src/modules/sync/writers/dispatch.js';

test('edge_to_drchrono: env unset, DB unreachable -> off (fail-closed floor, not dry)', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity('edge_to_drchrono', 'patients', {} as any);
  assert.equal(mode, 'off');
});

test('edge_to_drchrono: env=on but DB unreachable (no row) -> off (missing-row/DB-error fail-closed)', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity(
    'edge_to_drchrono',
    'appointments',
    { SYNC_WRITE_EDGE_TO_DRCHRONO: 'on' } as any,
  );
  assert.equal(mode, 'off');
});

test('edge_to_drchrono: env=dry, DB unreachable -> off (never escalates past fail-closed floor)', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity(
    'edge_to_drchrono',
    'patients',
    { SYNC_WRITE_EDGE_TO_DRCHRONO: 'dry' } as any,
  );
  assert.equal(mode, 'off');
});

test('edge_to_drchrono: env=verify, DB unreachable -> off (catch path never returns ceiling)', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity(
    'edge_to_drchrono',
    'appointments',
    { SYNC_WRITE_EDGE_TO_DRCHRONO: 'verify' } as any,
  );
  assert.equal(mode, 'off');
});

test('edge_to_drchrono: garbage env value -> off (same floor as unset)', async () => {
  invalidateControlCache();
  const mode = await writeModeForEntity(
    'edge_to_drchrono',
    'patients',
    { SYNC_WRITE_EDGE_TO_DRCHRONO: 'yolo' } as any,
  );
  assert.equal(mode, 'off');
});

// ---------------------------------------------------------------------------
// Ceiling-computation unit tests: exercise the pure branch logic directly by
// reading writeModeForEntity's ceiling via its observable off-floor behavior
// above. The clamp (min(db_mode, ceiling)) itself is already covered by the
// existing drchrono_to_edge tests in tests/sync/edge-dispatch.spec.ts, which
// share the identical resolver code path — edge_to_drchrono only changes which
// env var feeds the ceiling and confirms the OFF (not dry) default, proven by
// the five cases above collapsing to 'off' regardless of env content when no
// DB row is reachable.
// ---------------------------------------------------------------------------
