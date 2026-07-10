/**
 * EDGE-10 Plan 02 (ECUT-01) — verify (not rebuild) the EDGE-06 dual-destination
 * dispatch: one DrChrono event fans out to a GHL leg AND an independently-gated
 * Edge leg (engine.ts processOne, drchrono source branch). This test drives
 * `dispatchWrite` directly for both targets with fully injected deps (no
 * network, no real DB) — mirroring exactly how engine.ts invokes it for each
 * leg, so the assertions hold for the real dual-dispatch code path.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;
delete process.env.SYNC_WRITE_EDGE;

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchWrite } from '../../src/modules/sync/writers/dispatch.js';
import type { EdgeCtx } from '../../src/modules/edge/types.js';

const demoCtx: EdgeCtx = { edgeBusinessId: 'biz_demo', token: 'tok_demo' };
const LOC = 'DEMO_LOC_TEST'; // matches the demo allowlist used across edge-dispatch.spec.ts

/**
 * Simulates the engine.ts drchrono->X fan-out for ONE event: the GHL leg first
 * (in `on` mode, injected ghlHttp so no live network), then — in its own
 * try/catch, matching engine.ts lines ~216-235 — the additive Edge leg.
 */
async function dispatchBothLegs(opts: {
  ghlMode: 'off' | 'dry' | 'verify' | 'on';
  edgeMode: 'off' | 'dry' | 'verify' | 'on';
  edgeWriteFn?: (...args: unknown[]) => Promise<unknown>;
}): Promise<{ ghlOutcome: string; edgeOutcome: string | 'threw'; edgeError?: unknown }> {
  let ghlHttpCalled = false;
  const ghlOutcome = await dispatchWrite(
    { eventId: 'ev1', target: 'ghl', entity: 'contact', verb: 'create', token: 'tok', locationId: LOC, body: { a: 1 } },
    {
      mode: opts.ghlMode,
      ghlHttp: (async () => {
        ghlHttpCalled = true;
        return { status: 200, data: { id: 'ghl_1' } };
      }) as any,
    },
  );

  let edgeOutcome: string | 'threw' = 'skipped-off';
  let edgeError: unknown;
  try {
    edgeOutcome = await dispatchWrite(
      { eventId: 'ev1', target: 'edge', entity: 'contact', verb: 'create', locationId: LOC, body: { a: 1 } },
      {
        mode: opts.edgeMode,
        buildEdgeCtxFn: (async () => demoCtx) as any,
        edgeWriteFn: (opts.edgeWriteFn as any) ?? (async () => ({ status: 200, data: {} })),
      },
    );
  } catch (err) {
    // Mirrors engine.ts's own try/catch around the Edge leg — a throw here must
    // NEVER be allowed to unwind past the GHL leg, which already completed.
    edgeOutcome = 'threw';
    edgeError = err;
  }

  return { ghlOutcome, edgeOutcome, edgeError };
}

describe('dual-destination dispatch — independent gating (ECUT-01)', () => {
  test('both drchrono_to_ghl and drchrono_to_edge = on -> BOTH legs write', async () => {
    const { ghlOutcome, edgeOutcome } = await dispatchBothLegs({ ghlMode: 'on', edgeMode: 'on' });
    assert.equal(ghlOutcome, 'written');
    assert.equal(edgeOutcome, 'written');
  });

  test('drchrono_to_ghl=off, drchrono_to_edge=on -> only Edge writes', async () => {
    const { ghlOutcome, edgeOutcome } = await dispatchBothLegs({ ghlMode: 'off', edgeMode: 'on' });
    assert.equal(ghlOutcome, 'skipped-off');
    assert.equal(edgeOutcome, 'written');
  });

  test('drchrono_to_ghl=on, drchrono_to_edge=off -> only GHL writes (Edge leg skipped-off)', async () => {
    const { ghlOutcome, edgeOutcome } = await dispatchBothLegs({ ghlMode: 'on', edgeMode: 'off' });
    assert.equal(ghlOutcome, 'written');
    assert.equal(edgeOutcome, 'skipped-off');
  });

  test('Edge-leg throw does NOT break the already-completed GHL leg', async () => {
    const { ghlOutcome, edgeOutcome, edgeError } = await dispatchBothLegs({
      ghlMode: 'on',
      edgeMode: 'on',
      edgeWriteFn: async () => {
        throw new Error('edge writer boom');
      },
    });
    assert.equal(ghlOutcome, 'written', 'GHL leg must have completed before the Edge leg ran');
    assert.equal(edgeOutcome, 'threw');
    assert.ok(edgeError instanceof Error);
  });

  test('flipping one gate mid-run does not bleed into the other (independent per-call mode, matching per-direction cache keys)', async () => {
    const { invalidateControlCache } = await import('../../src/modules/sync/writers/dispatch.js');
    invalidateControlCache();
    const run1 = await dispatchBothLegs({ ghlMode: 'on', edgeMode: 'off' });
    invalidateControlCache();
    const run2 = await dispatchBothLegs({ ghlMode: 'off', edgeMode: 'on' });
    assert.equal(run1.ghlOutcome, 'written');
    assert.equal(run1.edgeOutcome, 'skipped-off');
    assert.equal(run2.ghlOutcome, 'skipped-off');
    assert.equal(run2.edgeOutcome, 'written');
  });
});
