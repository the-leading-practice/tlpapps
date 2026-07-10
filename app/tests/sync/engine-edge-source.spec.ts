/**
 * EDGE-07 Plan 02 T03 — engine.ts edge-source branch (loop-guard + gated dark writeback).
 *
 * Strategy: this repo's Node/test-runner setup does not have module-mocking wired for
 * the ESM graph engine.ts sits in (db/pg client import chain) — see the precedent in
 * tests/sync/edge-engine-invariant.spec.ts. `processEdgeSourceEvent` is exported for
 * direct unit testing; its counter increments happen BEFORE the final `markProcessed`
 * DB write, so with DATABASE_URL pointing at an unroutable sentinel we can observe the
 * counter side-effects even though the trailing DB call ultimately rejects (caught here,
 * mirroring how processBatch's own try/catch would route it to failEvent in prod).
 * Mapper-bypass and branch-ordering are proven via source-code assertions (same
 * precedent), since engine.ts has no DI seam for the ghl/drchrono mapper functions.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_EDGE_TO_DRCHRONO;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processEdgeSourceEvent } from '../../src/modules/sync/engine.js';
import { syncCounters } from '../../src/modules/sync/metrics.js';
import { tagFor } from '../../src/modules/sync/origin.js';
import { invalidateControlCache } from '../../src/modules/sync/writers/dispatch.js';
import type { SyncEvent } from '../../src/db/pg/schema/sync.js';

function makeEvent(overrides: Partial<SyncEvent> & { payload: unknown; action: string }): SyncEvent {
  return {
    id: 'evt-1',
    source: 'edge',
    action: overrides.action,
    payload: overrides.payload as any,
    receivedAt: new Date(),
    processedAt: null,
    status: 'pending',
    error: null,
    originTag: null,
    dedupKey: 'edge:updated:x:1',
    ...overrides,
  } as SyncEvent;
}

test('edge event with tlp-sync:edge origin tag -> loop-skip, no writer, sync_writes_skipped_loop incremented', async () => {
  invalidateControlCache();
  const before = syncCounters.snapshot().sync_writes_skipped_loop;

  const ev = makeEvent({
    action: 'updated',
    payload: { entity: 'contact', id: 'c1', notes: tagFor('edge', 'origin-evt-1') },
  });

  try {
    await processEdgeSourceEvent(ev);
  } catch {
    // markProcessed's trailing DB write rejects in this unit-test env (unroutable
    // DATABASE_URL sentinel) — the counter increment above already happened.
  }

  const after = syncCounters.snapshot().sync_writes_skipped_loop;
  assert.equal(after, before + 1, 'loop-guard must increment sync_writes_skipped_loop exactly once');
});

test('genuine edge event, edge_to_drchrono gate off (DB unreachable -> fail-closed off) -> no writer, sync_writes_skipped_off incremented', async () => {
  invalidateControlCache();
  const before = syncCounters.snapshot().sync_writes_skipped_off;

  const ev = makeEvent({
    action: 'updated',
    payload: { entity: 'appointment', id: 'a1' }, // no origin tag -> genuine event
  });

  try {
    await processEdgeSourceEvent(ev);
  } catch {
    // Same trailing-DB-write caveat as above.
  }

  const after = syncCounters.snapshot().sync_writes_skipped_off;
  assert.equal(after, before + 1, 'gate-off must increment sync_writes_skipped_off exactly once');
});

test('source-code assertion: processOne routes source==="edge" to processEdgeSourceEvent BEFORE the ghl/drchrono mapper', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../../src/modules/sync/engine.ts', import.meta.url), 'utf8');
  const processOneBody = src.slice(src.indexOf('async function processOne'), src.indexOf('async function processEdgeSourceEvent'));
  const edgeGuardIdx = processOneBody.indexOf("processEdgeSourceEvent(ev)");
  const mapperIdx = processOneBody.indexOf('ghlAppointmentToNormalized');
  assert.ok(edgeGuardIdx >= 0, 'processOne must call processEdgeSourceEvent');
  assert.ok(mapperIdx >= 0, 'processOne must still call the ghl/drchrono mapper for non-edge sources');
  assert.ok(edgeGuardIdx < mapperIdx, 'the edge-source branch must run BEFORE the ghl/drchrono mapper');
});

test('source-code assertion: processEdgeSourceEvent never references the ghl/drchrono mapper or dispatchWrite (no mis-map, no live write path)', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../../src/modules/sync/engine.ts', import.meta.url), 'utf8');
  const start = src.indexOf('export async function processEdgeSourceEvent');
  const end = src.indexOf('/** Upsert sync_mapping');
  const body = src.slice(start, end);
  assert.doesNotMatch(body, /ghlAppointmentToNormalized|drchronoAppointmentToNormalized/, 'must never invoke the ghl/drchrono mapper');
  assert.doesNotMatch(body, /dispatchWrite\(/, 'dark phase must never call dispatchWrite for edge_to_drchrono — no unmapped live write');
  assert.match(body, /writeModeForEntity\('edge_to_drchrono'/, 'must consult the edge_to_drchrono gate');
});
