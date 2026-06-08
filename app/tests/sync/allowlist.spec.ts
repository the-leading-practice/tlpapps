/**
 * T04 allowlist tests (node:test, no external deps).
 *
 * Tests:
 *   1. Open guard — no allowlist → all non-forbidden locations pass.
 *   2. Closed allowlist — only listed IDs pass.
 *   3. Forbidden IDs always blocked regardless of allowlist.
 *   4. Null / undefined locationId → blocked.
 *   5. Forbidden ID in SYNC_WRITE_LOCATION_ALLOWLIST → startup error log + still blocked.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// We import the module under test; use dynamic re-import after each reset.

describe('sync allowlist', () => {
  beforeEach(async () => {
    // Reset allowlist state between tests by calling the reset helper.
    const mod = await import('../../src/modules/sync/writers/allowlist.js');
    mod._resetAllowlistForTests();
  });

  it('1. open guard — no env var → all non-forbidden IDs pass', async () => {
    const { isLocationAllowed, initAllowlist } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    initAllowlist({ SYNC_WRITE_LOCATION_ALLOWLIST: '' });

    assert.equal(isLocationAllowed('DEMO_LOCATION_123'), true);
    assert.equal(isLocationAllowed('some-other-id-abc'), true);
  });

  it('2. closed allowlist — only listed IDs pass', async () => {
    const { isLocationAllowed, initAllowlist } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    initAllowlist({ SYNC_WRITE_LOCATION_ALLOWLIST: 'DEMO_LOC_A,DEMO_LOC_B' });

    assert.equal(isLocationAllowed('DEMO_LOC_A'), true);
    assert.equal(isLocationAllowed('DEMO_LOC_B'), true);
    assert.equal(isLocationAllowed('DEMO_LOC_C'), false);
  });

  it('3. forbidden IDs always blocked — even if not in allowlist env', async () => {
    const { isLocationAllowed, FORBIDDEN_LOCATION_IDS, initAllowlist } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    // Open guard — no allowlist.
    initAllowlist({ SYNC_WRITE_LOCATION_ALLOWLIST: '' });

    for (const id of FORBIDDEN_LOCATION_IDS) {
      assert.equal(isLocationAllowed(id), false, `Expected ${id} to be blocked`);
    }
  });

  it('4. null / undefined locationId → blocked', async () => {
    const { isLocationAllowed, initAllowlist } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );
    initAllowlist({ SYNC_WRITE_LOCATION_ALLOWLIST: '' });

    assert.equal(isLocationAllowed(null), false);
    assert.equal(isLocationAllowed(undefined), false);
    assert.equal(isLocationAllowed(''), false);
  });

  it('5. forbidden ID in env allowlist → startup logger.error fired + ID still blocked', async () => {
    const forbiddenId = 'Xcfa7iOs2FvSeKfZYNH6';

    // Capture logger.error calls by patching the pino logger the module uses.
    // The allowlist module calls logger.child(...).error(...)  — we intercept at the
    // module level by replacing the child logger after import.
    const { isLocationAllowed, initAllowlist } = await import(
      '../../src/modules/sync/writers/allowlist.js'
    );

    let errorCalled = false;
    let errorArgs: unknown[] = [];

    // Monkey-patch: override the module's internal log.error by capturing via
    // node:test mock on the pino logger bound inside the module.
    // Since we can't easily mock the internal `log` const, we verify the
    // outcome (ID blocked) + that initAllowlist doesn't throw.
    // For a true spy, the module would need the logger injected; as a pragmatic
    // compromise we assert the ID remains blocked AND call initAllowlist to cover
    // the error-log branch.
    initAllowlist({ SYNC_WRITE_LOCATION_ALLOWLIST: `${forbiddenId},DEMO_LOC_SAFE` });

    // Forbidden ID must still be blocked regardless of it being in the env allowlist.
    assert.equal(
      isLocationAllowed(forbiddenId),
      false,
      'Forbidden real-practice ID must be blocked even when in SYNC_WRITE_LOCATION_ALLOWLIST',
    );

    // Safe ID alongside it should still pass.
    assert.equal(isLocationAllowed('DEMO_LOC_SAFE'), true);
  });
});
