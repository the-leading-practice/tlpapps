/**
 * Allowlist tests (node:test, no external deps).
 *
 * Tests:
 *   1. Fail-closed default — no allowlist → ALL locations denied (CR-01 fix).
 *   2. Closed allowlist — only listed IDs pass.
 *   3. Forbidden IDs always blocked regardless of allowlist.
 *   4. Forbidden ID IS in allowlist → still blocked (belt-and-suspenders, CR-01).
 *   5. Null / undefined / empty locationId → blocked.
 *   6. Per-call re-evaluation — empty at first call, env set before second call → new
 *      call reflects updated allowlist (CR-04 fix; no restart needed).
 *
 * NOTE: Test 1 was previously "open guard — all non-forbidden IDs pass" which encoded
 * the buggy fail-open behavior.  It is now updated to the correct fail-closed expectation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('sync allowlist', () => {
  // No beforeEach reset needed — module is stateless (per-call env read).

  it('1. fail-closed default — no env var → ALL non-forbidden IDs denied', async () => {
    const { isLocationAllowed } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    // Empty allowlist must deny everything, including a plausible demo location.
    assert.equal(isLocationAllowed('DEMO_LOCATION_123', 'ghl', {}), false,
      'Empty allowlist must deny non-forbidden ID (fail-closed)');
    assert.equal(isLocationAllowed('some-other-id-abc', 'ghl', {}), false,
      'Empty allowlist must deny any ID (fail-closed)');
    assert.equal(isLocationAllowed('wP3Ynm3Z63rIC4zVAgXP', 'ghl', {}), false,
      'Empty allowlist must deny demo GHL location (fail-closed)');
  });

  it('2. closed allowlist — only listed IDs pass', async () => {
    const { isLocationAllowed } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    const env = { SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_A,DEMO_LOC_B' } as NodeJS.ProcessEnv;

    assert.equal(isLocationAllowed('DEMO_LOC_A', 'ghl', env), true);
    assert.equal(isLocationAllowed('DEMO_LOC_B', 'ghl', env), true);
    assert.equal(isLocationAllowed('DEMO_LOC_C', 'ghl', env), false);
  });

  it('3. forbidden IDs always blocked — even when allowlist is open', async () => {
    const { isLocationAllowed, FORBIDDEN_LOCATION_IDS } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    // Build a "permissive" env that lists the forbidden IDs — they must still be denied.
    const forbidden = [...FORBIDDEN_LOCATION_IDS];
    const env = { SYNC_WRITE_LOCATION_ALLOWLIST: forbidden.join(',') } as NodeJS.ProcessEnv;

    for (const id of FORBIDDEN_LOCATION_IDS) {
      assert.equal(isLocationAllowed(id, 'ghl', env), false,
        `Forbidden ID ${id} must be blocked even when in SYNC_WRITE_LOCATION_ALLOWLIST`);
    }
  });

  it('4. forbidden ID in allowlist + safe ID — safe ID still passes, forbidden ID still blocked', async () => {
    const { isLocationAllowed } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    const forbiddenId = 'Xcfa7iOs2FvSeKfZYNH6';
    const env = { SYNC_WRITE_LOCATION_ALLOWLIST: `${forbiddenId},DEMO_LOC_SAFE` } as NodeJS.ProcessEnv;

    assert.equal(isLocationAllowed(forbiddenId, 'ghl', env), false,
      'Forbidden real-practice ID must be blocked even when in allowlist');
    assert.equal(isLocationAllowed('DEMO_LOC_SAFE', 'ghl', env), true,
      'Safe ID alongside a forbidden ID must still pass');
  });

  it('5. null / undefined / empty locationId → blocked', async () => {
    const { isLocationAllowed } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    const env = { SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_A' } as NodeJS.ProcessEnv;

    assert.equal(isLocationAllowed(null, 'ghl', env), false);
    assert.equal(isLocationAllowed(undefined, 'ghl', env), false);
    assert.equal(isLocationAllowed('', 'ghl', env), false);
  });

  it('6. per-call re-evaluation — empty env first call, populated env second call → reflects new allowlist (CR-04)', async () => {
    const { isLocationAllowed } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    const emptyEnv = {} as NodeJS.ProcessEnv;
    const populatedEnv = { SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_DYNAMIC' } as NodeJS.ProcessEnv;

    // First call with empty env — must deny (fail-closed).
    assert.equal(isLocationAllowed('DEMO_LOC_DYNAMIC', 'ghl', emptyEnv), false,
      'Empty env must deny on first call');

    // Second call with populated env — must now allow (no restart required).
    assert.equal(isLocationAllowed('DEMO_LOC_DYNAMIC', 'ghl', populatedEnv), true,
      'Populated env must allow on subsequent call without restart (CR-04 fix)');

    // And going back to empty denies again — not stuck open.
    assert.equal(isLocationAllowed('DEMO_LOC_DYNAMIC', 'ghl', emptyEnv), false,
      'Returning to empty env must deny again (not stuck open)');
  });
});
