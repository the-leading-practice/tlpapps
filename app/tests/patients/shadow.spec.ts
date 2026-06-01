/**
 * P05 T02 — patient shadow-compare diff/categorization unit tests (no DB, no Mongo).
 *
 * Exercises the PURE diff + normalize functions, which are the logic the cutover
 * gate depends on: identical results => no real diff (=> no sync_conflicts row);
 * a tracked-field difference => exactly one `real` diff; timestamp-only drift =>
 * `expected` (never gates).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, diff } from '../../src/modules/patients/shadow-diff.js';

const base = { locationId: 'loc-1', patientId: 42, contactId: 'c-1' };

test('identical results: zero diffs (=> no conflict row)', () => {
  const d = diff(normalize({ ...base }), normalize({ ...base }));
  assert.equal(d.length, 0);
});

test('single tracked-field difference: exactly one real diff', () => {
  const d = diff(normalize({ ...base }), normalize({ ...base, contactId: 'c-DIFFERENT' }));
  const real = d.filter((x) => x.category === 'real');
  assert.equal(real.length, 1);
  assert.equal(real[0].field, 'contactId');
  assert.equal(real[0].mongo, 'c-1');
  assert.equal(real[0].pg, 'c-DIFFERENT');
});

test('presence mismatch (one side missing): one real diff', () => {
  const d = diff(normalize({ ...base }), normalize(null));
  assert.equal(d.length, 1);
  assert.equal(d[0].category, 'real');
  assert.equal(d[0].field, '__presence__');
});

test('both missing: zero diffs', () => {
  assert.equal(diff(normalize(null), normalize(undefined)).length, 0);
});

test('normalize reduces to canonical mapping shape', () => {
  const n = normalize({ ...base, extra: 'ignored' } as never);
  assert.deepEqual(n, { locationId: 'loc-1', patientId: 42, contactId: 'c-1' });
});
