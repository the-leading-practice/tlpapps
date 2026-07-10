/**
 * EDGE-10 Plan 03 (ECUT-03) — per-destination allowlist regression + new-behavior
 * proofs. Vitest (no DB, no network); the DB overlay is injected via
 * `_setAllowlistOverlayForTests` so every case is deterministic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLocationAllowed,
  resolveAllowed,
  FORBIDDEN_LOCATION_IDS,
  _setAllowlistOverlayForTests,
  invalidateAllowlistCache,
} from '../allowlist.js';

const [FORBIDDEN_ID] = [...FORBIDDEN_LOCATION_IDS];

describe('isLocationAllowed — per-destination (EDGE-10 Plan 03)', () => {
  beforeEach(() => {
    invalidateAllowlistCache();
  });

  // -------------------------------------------------------------------------
  // REGRESSION: GHL bucket byte-identical to the legacy single allowlist when
  // the DB overlay is empty.
  // -------------------------------------------------------------------------
  describe('GHL bucket byte-identical regression (empty DB overlay)', () => {
    const cases: Array<{
      label: string;
      id: string | null | undefined;
      env: NodeJS.ProcessEnv;
      expected: boolean;
    }> = [
      { label: 'empty env denies unknown id', id: 'DEMO_LOC_X', env: {}, expected: false },
      {
        label: 'listed id allowed',
        id: 'DEMO_LOC_A',
        env: { SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_A,DEMO_LOC_B' },
        expected: true,
      },
      {
        label: 'unlisted id denied',
        id: 'DEMO_LOC_C',
        env: { SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_A,DEMO_LOC_B' },
        expected: false,
      },
      {
        label: 'forbidden id denied even if listed',
        id: FORBIDDEN_ID,
        env: { SYNC_WRITE_LOCATION_ALLOWLIST: FORBIDDEN_ID },
        expected: false,
      },
      { label: 'null id denied', id: null, env: { SYNC_WRITE_LOCATION_ALLOWLIST: 'X' }, expected: false },
      { label: 'undefined id denied', id: undefined, env: { SYNC_WRITE_LOCATION_ALLOWLIST: 'X' }, expected: false },
      { label: 'empty-string id denied', id: '', env: { SYNC_WRITE_LOCATION_ALLOWLIST: 'X' }, expected: false },
    ];

    for (const c of cases) {
      it(`${c.label} => ${c.expected}`, () => {
        expect(isLocationAllowed(c.id, 'ghl', c.env)).toBe(c.expected);
      });
    }
  });

  // -------------------------------------------------------------------------
  // SYNCHRONOUS RETURN — explicit defense-in-depth, non-Promise boolean.
  // -------------------------------------------------------------------------
  it('returns a boolean synchronously, never a Promise', () => {
    const result = isLocationAllowed('DEMO_LOC_A', 'ghl', {
      SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_A',
    });
    expect(typeof result).toBe('boolean');
    expect((result as unknown) instanceof Promise).toBe(false);
    expect((result as unknown as { then?: unknown })?.then).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // PER-DESTINATION routing — GHL-listed id is NOT automatically Edge-allowed.
  // -------------------------------------------------------------------------
  it('GHL-listed id is denied on the edge bucket until an edge allow-row exists', () => {
    const env = { SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_A' } as NodeJS.ProcessEnv;
    _setAllowlistOverlayForTests([], []);
    expect(isLocationAllowed('DEMO_LOC_A', 'ghl', env)).toBe(true);
    expect(isLocationAllowed('DEMO_LOC_A', 'edge', env)).toBe(false);
  });

  it('edge allow-row grants the edge bucket independent of the GHL env list', () => {
    const env = {} as NodeJS.ProcessEnv;
    _setAllowlistOverlayForTests([], ['DEMO_LOC_A']);
    expect(isLocationAllowed('DEMO_LOC_A', 'edge', env)).toBe(true);
    expect(isLocationAllowed('DEMO_LOC_A', 'ghl', env)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // FAIL-CLOSED EDGE
  // -------------------------------------------------------------------------
  it('edge bucket denies everything when overlay + env fallback are both empty', () => {
    _setAllowlistOverlayForTests([], []);
    expect(isLocationAllowed('DEMO_LOC_A', 'edge', {})).toBe(false);
  });

  it('forbidden id denied on edge even with an allow-row', () => {
    _setAllowlistOverlayForTests([], [FORBIDDEN_ID]);
    expect(isLocationAllowed(FORBIDDEN_ID, 'edge', {})).toBe(false);
  });

  // -------------------------------------------------------------------------
  // GHL DENY OVERLAY — cutover deny-row subtracts from the env base.
  // -------------------------------------------------------------------------
  it('GHL deny-row removes a location from the GHL bucket without touching env', () => {
    const env = { SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_A,DEMO_LOC_B' } as NodeJS.ProcessEnv;
    _setAllowlistOverlayForTests(['DEMO_LOC_A'], []);
    expect(isLocationAllowed('DEMO_LOC_A', 'ghl', env)).toBe(false);
    expect(isLocationAllowed('DEMO_LOC_B', 'ghl', env)).toBe(true);
  });
});

describe('resolveAllowed — pure core resolver', () => {
  it('ghl: null env => deny', () => {
    expect(
      resolveAllowed('X', 'ghl', { ghlEnv: null, edgeEnv: null, ghlDenied: new Set(), edgeAllowed: new Set() }),
    ).toBe(false);
  });

  it('edge: non-empty allow overlay ignores env fallback entirely', () => {
    expect(
      resolveAllowed('Y', 'edge', {
        ghlEnv: null,
        edgeEnv: new Set(['X']),
        ghlDenied: new Set(),
        edgeAllowed: new Set(['X']),
      }),
    ).toBe(false); // Y not in the overlay, and overlay is non-empty so env fallback is skipped
  });

  it('edge: empty overlay falls back to env list', () => {
    expect(
      resolveAllowed('X', 'edge', {
        ghlEnv: null,
        edgeEnv: new Set(['X']),
        ghlDenied: new Set(),
        edgeAllowed: new Set(),
      }),
    ).toBe(true);
  });
});
