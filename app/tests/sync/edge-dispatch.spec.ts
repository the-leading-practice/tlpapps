/**
 * EDGE-06 Plan 03 — buildEdgeCtx demo-guardrail + dispatchWrite target:'edge' coverage.
 * All wrapper/DB/crypto touchpoints are mocked/injected — zero network, zero real DB.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;
delete process.env.SYNC_WRITE_EDGE;

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildEdgeCtx, type EdgeConfigRow } from '../../src/modules/sync/writers/edge-ctx.js';
import { dispatchWrite } from '../../src/modules/sync/writers/dispatch.js';
import type { EdgeCtx } from '../../src/modules/edge/types.js';

const baseRow: EdgeConfigRow = {
  edgeBusinessId: 'biz_real',
  edgeTokenCiphertext: 'deadbeef',
  edgeSignedOff: true,
  demoBusinessIdOverride: null,
  internalLocationId: 1,
};

// ---------------------------------------------------------------------------
// buildEdgeCtx — demo guardrail (Task 1)
// ---------------------------------------------------------------------------

describe('buildEdgeCtx demo-guardrail (D-06, fail-closed)', () => {
  test('edgeSignedOff=true + demo unset -> resolves to the REAL business id', async () => {
    const ctx = await buildEdgeCtx(
      'GHL_LOC_1',
      {},
      { getEdgeConfig: async () => baseRow, decrypt: () => 'plaintext-token' },
    );
    assert.equal(ctx?.edgeBusinessId, 'biz_real');
    assert.equal(ctx?.token, 'plaintext-token');
  });

  test('edgeSignedOff=false -> resolves to demoBusinessIdOverride', async () => {
    const row: EdgeConfigRow = { ...baseRow, edgeSignedOff: false, demoBusinessIdOverride: 'biz_demo_override' };
    const ctx = await buildEdgeCtx('GHL_LOC_1', {}, { getEdgeConfig: async () => row, decrypt: () => 'tok' });
    assert.equal(ctx?.edgeBusinessId, 'biz_demo_override');
  });

  test('edgeSignedOff=false + no demo override + no config.edgeDemoBusinessId -> null (refuse)', async () => {
    const row: EdgeConfigRow = { ...baseRow, edgeSignedOff: false, demoBusinessIdOverride: null };
    const ctx = await buildEdgeCtx('GHL_LOC_1', {}, { getEdgeConfig: async () => row, decrypt: () => 'tok' });
    assert.equal(ctx, null);
  });

  test('missing edgeTokenCiphertext -> null (refuse, never a ctx without a token)', async () => {
    const row: EdgeConfigRow = { ...baseRow, edgeTokenCiphertext: null };
    const ctx = await buildEdgeCtx('GHL_LOC_1', {}, { getEdgeConfig: async () => row });
    assert.equal(ctx, null);
  });

  test('no edge_location_config row -> null (refuse)', async () => {
    const ctx = await buildEdgeCtx('GHL_LOC_1', {}, { getEdgeConfig: async () => null });
    assert.equal(ctx, null);
  });

  test('config lookup throws -> null (fail-closed, never throws out)', async () => {
    const ctx = await buildEdgeCtx('GHL_LOC_1', {}, {
      getEdgeConfig: async () => { throw new Error('db down'); },
    });
    assert.equal(ctx, null);
  });

  test('decrypt failure -> null (refuse, never surfaces plaintext/partial data)', async () => {
    const ctx = await buildEdgeCtx('GHL_LOC_1', {}, {
      getEdgeConfig: async () => baseRow,
      decrypt: () => { throw new Error('bad auth tag'); },
    });
    assert.equal(ctx, null);
  });

  test('calendarId resolved only when ehrCalendarId is provided', async () => {
    let calledWithCalendar: string | undefined;
    const ctx = await buildEdgeCtx(
      'GHL_LOC_1',
      { ehrCalendarId: 'cal_ehr_1' },
      {
        getEdgeConfig: async () => baseRow,
        decrypt: () => 'tok',
        getCalendarId: async (_locId, ehrCalId) => {
          calledWithCalendar = ehrCalId;
          return 'cal_edge_1';
        },
      },
    );
    assert.equal(calledWithCalendar, 'cal_ehr_1');
    assert.equal(ctx?.calendarId, 'cal_edge_1');
  });
});

// ---------------------------------------------------------------------------
// dispatchWrite target:'edge' — mode matrix + allowlist + guardrail refusal
// ---------------------------------------------------------------------------

const demoCtx: EdgeCtx = { edgeBusinessId: 'biz_demo', token: 'tok_demo' };

describe('dispatchWrite target:edge mode matrix', () => {
  test('mode off -> skipped-off, edgeWrite never called', async () => {
    let called = false;
    const outcome = await dispatchWrite(
      { eventId: 'ed1', target: 'edge', entity: 'contact', verb: 'create', locationId: 'DEMO_LOC_TEST' },
      { mode: 'off', edgeWriteFn: (async () => { called = true; return { status: 200, data: {} }; }) as any },
    );
    assert.equal(outcome, 'skipped-off');
    assert.equal(called, false);
  });

  test('mode dry -> dry-logged, edgeWrite never called', async () => {
    let called = false;
    const outcome = await dispatchWrite(
      { eventId: 'ed2', target: 'edge', entity: 'contact', verb: 'create', locationId: 'DEMO_LOC_TEST' },
      { mode: 'dry', edgeWriteFn: (async () => { called = true; return { status: 200, data: {} }; }) as any },
    );
    assert.equal(outcome, 'dry-logged');
    assert.equal(called, false);
  });

  test('mode verify -> verified, edgeWrite called with sink-routed deps (no live network)', async () => {
    let sinkCalls = 0;
    let realWrapperCalled = false;
    const outcome = await dispatchWrite(
      { eventId: 'ed3', target: 'edge', entity: 'contact', verb: 'create', locationId: 'DEMO_LOC_TEST', body: { firstName: 'A' } },
      {
        mode: 'verify',
        buildEdgeCtxFn: (async () => demoCtx) as any,
        edgeHttp: async (url: string) => { sinkCalls++; return { status: 200, data: { captured: true } }; },
        edgeWriteFn: (async (input: any, deps: any) => {
          // Simulate the real edgeWrite's internal wrapper-call so we can prove the
          // SINK deps were injected, not the real Edge wrappers.
          if (deps.createContact) {
            await deps.createContact(input.ctx, { firstName: 'A' });
          } else {
            realWrapperCalled = true;
          }
          return { status: 200, data: {} };
        }) as any,
      },
    );
    assert.equal(outcome, 'verified');
    assert.equal(sinkCalls, 1);
    assert.equal(realWrapperCalled, false);
  });

  test('mode on -> written, edgeWrite called with the real (injected) wrapper deps', async () => {
    let called = false;
    const outcome = await dispatchWrite(
      { eventId: 'ed4', target: 'edge', entity: 'contact', verb: 'create', locationId: 'DEMO_LOC_TEST', body: { firstName: 'A' } },
      {
        mode: 'on',
        buildEdgeCtxFn: (async () => demoCtx) as any,
        edgeWriteFn: (async () => { called = true; return { status: 200, data: {} }; }) as any,
      },
    );
    assert.equal(outcome, 'written');
    assert.equal(called, true);
  });

  test('on-mode with buildEdgeCtx returning null -> skipped, NO live write', async () => {
    let called = false;
    const outcome = await dispatchWrite(
      { eventId: 'ed5', target: 'edge', entity: 'contact', verb: 'create', locationId: 'DEMO_LOC_TEST', body: {} },
      {
        mode: 'on',
        buildEdgeCtxFn: (async () => null) as any,
        edgeWriteFn: (async () => { called = true; return { status: 200, data: {} }; }) as any,
      },
    );
    assert.equal(outcome, 'skipped-off');
    assert.equal(called, false);
  });

  test('allowlist guard applies before verify/on — SAME GHL-shaped locationId, unallowlisted -> skipped', async () => {
    let ctxBuilt = false;
    const outcome = await dispatchWrite(
      { eventId: 'ed6', target: 'edge', entity: 'contact', verb: 'create', locationId: 'NOT_ALLOWLISTED_XYZ', body: {} },
      {
        mode: 'on',
        buildEdgeCtxFn: (async () => { ctxBuilt = true; return demoCtx; }) as any,
      },
    );
    assert.equal(outcome, 'skipped-off');
    assert.equal(ctxBuilt, false, 'buildEdgeCtx must never be reached when the allowlist blocks first');
  });

  test('FORBIDDEN_LOCATION_IDS: a real-practice GHL id hard-blocks the edge dispatch (buildEdgeCtx/edgeWrite never called)', async () => {
    const { FORBIDDEN_LOCATION_IDS } = await import('../../src/modules/sync/writers/allowlist.js');
    const [forbiddenId] = [...FORBIDDEN_LOCATION_IDS];
    let ctxBuilt = false;
    let writeCalled = false;
    const outcome = await dispatchWrite(
      { eventId: 'ed7', target: 'edge', entity: 'contact', verb: 'create', locationId: forbiddenId, body: {} },
      {
        mode: 'on',
        buildEdgeCtxFn: (async () => { ctxBuilt = true; return demoCtx; }) as any,
        edgeWriteFn: (async () => { writeCalled = true; return { status: 200, data: {} }; }) as any,
      },
    );
    assert.equal(outcome, 'skipped-off');
    assert.equal(ctxBuilt, false);
    assert.equal(writeCalled, false);
  });
});
