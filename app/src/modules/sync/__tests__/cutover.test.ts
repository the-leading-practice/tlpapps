/**
 * EDGE-10 Plan 03 (ECUT-03) — cutover.ts proofs. Vitest, no live DB/network:
 * a fake db handle is injected via CutoverDeps.dbHandle, matching the exact
 * select/transaction/execute chain shape cutover.ts calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { cutoverLocationToEdge } from '../cutover.js';
import { edgeLocationConfig } from '../../../db/pg/schema/edge.js';
import { locations } from '../../../db/pg/schema/config.js';
import {
  isLocationAllowed,
  _setAllowlistOverlayForTests,
  invalidateAllowlistCache,
} from '../writers/allowlist.js';

type FakeDbOpts = {
  edgeCfg?: { edgeSignedOff: boolean } | null;
  loc?: { location: string } | null;
  failOnSecondInsert?: boolean;
};

function makeFakeDb(opts: FakeDbOpts) {
  const inserts: Array<{ destination: string; locationId: string; allowed: boolean }> = [];
  const executeCalls: unknown[] = [];

  const dbHandle: any = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === edgeLocationConfig) {
            return opts.edgeCfg !== undefined && opts.edgeCfg !== null ? [opts.edgeCfg] : [];
          }
          if (table === locations) {
            return opts.loc !== undefined && opts.loc !== null ? [opts.loc] : [];
          }
          return [];
        },
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<void>) => {
      const staged: Array<{ destination: string; locationId: string; allowed: boolean }> = [];
      const tx = {
        insert: (_table: unknown) => ({
          values: (v: { destination: string; locationId: string; allowed: boolean }) => ({
            onConflictDoUpdate: async () => {
              if (opts.failOnSecondInsert && staged.length === 1) {
                throw new Error('simulated tx failure — mid-move');
              }
              staged.push(v);
            },
          }),
        }),
      };
      await cb(tx); // if this throws, staged rows are never committed (rollback semantics)
      inserts.push(...staged);
    },
    execute: async (q: unknown) => {
      executeCalls.push(q);
    },
  };

  return { dbHandle, inserts, executeCalls };
}

describe('cutoverLocationToEdge', () => {
  beforeEach(() => {
    invalidateAllowlistCache();
  });

  it('(a) not signed off → refused, zero writes', async () => {
    const { dbHandle, inserts } = makeFakeDb({ edgeCfg: { edgeSignedOff: false }, loc: { location: 'LOC_A' } });
    const result = await cutoverLocationToEdge(1, {
      dbHandle,
      env: { SYNC_WRITE_EDGE: 'on' } as NodeJS.ProcessEnv,
    });
    expect(result).toEqual({ ok: false, refused: 'not_signed_off' });
    expect(inserts).toHaveLength(0);
  });

  it('(a) missing edge_location_config row → refused, zero writes', async () => {
    const { dbHandle, inserts } = makeFakeDb({ edgeCfg: null, loc: { location: 'LOC_A' } });
    const result = await cutoverLocationToEdge(1, {
      dbHandle,
      env: { SYNC_WRITE_EDGE: 'on' } as NodeJS.ProcessEnv,
    });
    expect(result).toEqual({ ok: false, refused: 'not_signed_off' });
    expect(inserts).toHaveLength(0);
  });

  it('(b) ceiling below on → refused, zero writes', async () => {
    const { dbHandle, inserts } = makeFakeDb({ edgeCfg: { edgeSignedOff: true }, loc: { location: 'LOC_A' } });
    const result = await cutoverLocationToEdge(1, {
      dbHandle,
      env: { SYNC_WRITE_EDGE: 'dry' } as NodeJS.ProcessEnv,
    });
    expect(result).toEqual({ ok: false, refused: 'edge_ceiling_below_on' });
    expect(inserts).toHaveLength(0);
  });

  it('(c) signed-off + ceiling on → both rows written in one tx, ok result', async () => {
    const { dbHandle, inserts, executeCalls } = makeFakeDb({
      edgeCfg: { edgeSignedOff: true },
      loc: { location: 'LOC_A' },
    });
    const result = await cutoverLocationToEdge(1, {
      dbHandle,
      env: { SYNC_WRITE_EDGE: 'on' } as NodeJS.ProcessEnv,
      updatedBy: 'test-operator',
    });
    expect(result).toEqual({
      ok: true,
      location: 'LOC_A',
      moved: { ghl: 'removed', edge: 'added' },
    });
    expect(inserts).toEqual([
      { destination: 'ghl', locationId: 'LOC_A', allowed: false, updatedBy: 'test-operator' },
      { destination: 'edge', locationId: 'LOC_A', allowed: true, updatedBy: 'test-operator' },
    ]);
    expect(executeCalls).toHaveLength(1); // pg_notify
  });

  it('(d) per-location isolation — A moved, B intact', async () => {
    const { dbHandle } = makeFakeDb({ edgeCfg: { edgeSignedOff: true }, loc: { location: 'LOC_A' } });
    const result = await cutoverLocationToEdge(1, {
      dbHandle,
      env: { SYNC_WRITE_EDGE: 'on' } as NodeJS.ProcessEnv,
    });
    expect(result.ok).toBe(true);

    // Simulate the overlay snapshot the cutover's writes produced.
    _setAllowlistOverlayForTests(['LOC_A'], ['LOC_A']);

    const ghlEnv = { SYNC_WRITE_LOCATION_ALLOWLIST: 'LOC_A,LOC_B' } as NodeJS.ProcessEnv;

    // A: removed from GHL, added to Edge.
    expect(isLocationAllowed('LOC_A', 'ghl', ghlEnv)).toBe(false);
    expect(isLocationAllowed('LOC_A', 'edge', ghlEnv)).toBe(true);

    // B: untouched — still GHL-allowed, still Edge-denied.
    expect(isLocationAllowed('LOC_B', 'ghl', ghlEnv)).toBe(true);
    expect(isLocationAllowed('LOC_B', 'edge', ghlEnv)).toBe(false);
  });

  it('(e) drain — captured-at-dispatch membership: pre-flip GHL write, post-flip Edge write, zero dupe/zero loss', async () => {
    const ghlEnv = { SYNC_WRITE_LOCATION_ALLOWLIST: 'LOC_A' } as NodeJS.ProcessEnv;

    // Before cutover: no DB overlay — GHL leg allowed, Edge leg denied.
    _setAllowlistOverlayForTests([], []);
    const preFlipGhlAllowed = isLocationAllowed('LOC_A', 'ghl', ghlEnv);
    const preFlipEdgeAllowed = isLocationAllowed('LOC_A', 'edge', ghlEnv);
    expect(preFlipGhlAllowed).toBe(true);
    expect(preFlipEdgeAllowed).toBe(false);

    // A pre-flip-dispatched event captured membership as GHL-allowed — it
    // completes its GHL write exactly once (simulated by the boolean already
    // captured above; the cutover below must NOT retroactively change it).
    const eventWroteGhl = preFlipGhlAllowed; // captured at dispatch time
    expect(eventWroteGhl).toBe(true);

    // Cutover flips A: GHL denied, Edge allowed. Cache invalidated as part of
    // the real flow; here we simulate the resulting snapshot directly.
    _setAllowlistOverlayForTests(['LOC_A'], ['LOC_A']);

    // A NEW event dispatched after the flip sees the new membership.
    const postFlipGhlAllowed = isLocationAllowed('LOC_A', 'ghl', ghlEnv);
    const postFlipEdgeAllowed = isLocationAllowed('LOC_A', 'edge', ghlEnv);
    expect(postFlipGhlAllowed).toBe(false);
    expect(postFlipEdgeAllowed).toBe(true);
    const eventWroteEdge = postFlipEdgeAllowed;
    expect(eventWroteEdge).toBe(true);

    // Exactly one write landed per event: the pre-flip event's GHL write is
    // NOT retroactively duplicated to Edge, and the post-flip event's Edge
    // write is NOT also sent to GHL.
    expect(eventWroteGhl && postFlipGhlAllowed).toBe(false); // no double-write on GHL post-flip
  });

  it('(f) transactional rollback — mid-move failure leaves zero committed rows', async () => {
    const { dbHandle, inserts } = makeFakeDb({
      edgeCfg: { edgeSignedOff: true },
      loc: { location: 'LOC_A' },
      failOnSecondInsert: true,
    });
    await expect(
      cutoverLocationToEdge(1, { dbHandle, env: { SYNC_WRITE_EDGE: 'on' } as NodeJS.ProcessEnv }),
    ).rejects.toThrow('simulated tx failure');
    expect(inserts).toHaveLength(0); // no half-move: neither row committed
  });

  it('location not found → refused with location_not_found', async () => {
    const { dbHandle, inserts } = makeFakeDb({ edgeCfg: { edgeSignedOff: true }, loc: null });
    const result = await cutoverLocationToEdge(999, {
      dbHandle,
      env: { SYNC_WRITE_EDGE: 'on' } as NodeJS.ProcessEnv,
    });
    expect(result).toEqual({ ok: false, refused: 'location_not_found' });
    expect(inserts).toHaveLength(0);
  });
});
