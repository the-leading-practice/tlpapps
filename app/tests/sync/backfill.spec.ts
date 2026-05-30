/**
 * P09 T05 — backfill arg parsing + dry-run safety unit tests (no DB, no EHR).
 *
 * Proves: dry-run is the DEFAULT and inserts NOTHING; --apply enables insertion via the
 * injected insertFn; flags parse correctly.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArgs,
  backfill,
  type RawAppointment,
} from '../../scripts/backfill-appointments.js';

const sample: RawAppointment[] = [
  { source: 'ghl', action: 'created', externalId: 'g1', payload: { id: 'g1' } },
  { source: 'drchrono', action: 'created', externalId: 'd1', payload: { id: 'd1' } },
];

test('parseArgs: dry-run is the default', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs([]).days, 90);
});

test('parseArgs: flags', () => {
  const a = parseArgs(['--apply', '--days', '30', '--location', 'loc-x']);
  assert.equal(a.apply, true);
  assert.equal(a.days, 30);
  assert.equal(a.location, 'loc-x');
});

test('backfill dry-run: counts but inserts nothing', async () => {
  let inserts = 0;
  const summary = await backfill(sample, false, async () => {
    inserts++;
    return true;
  });
  assert.equal(inserts, 0);
  assert.equal(summary.wouldInsert, 2);
  assert.equal(summary.inserted, 0);
  assert.equal(summary.bySource.ghl, 1);
});

test('backfill apply: uses insertFn, tracks inserted vs skipped', async () => {
  const seen = new Set<string>();
  const summary = await backfill([...sample, sample[0]], true, async (_a, key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  assert.equal(summary.inserted, 2);
  assert.equal(summary.skippedExisting, 1);
});
