/**
 * P05 T02 — patient shadow-compare diff/categorization unit tests (no DB, no Mongo).
 *
 * Exercises the PURE diff + normalize functions, which are the logic the cutover
 * gate depends on: identical results => no real diff (=> no sync_conflicts row);
 * a tracked-field difference => exactly one `real` diff; timestamp-only drift =>
 * `expected` (never gates).
 *
 * Also tests `normalizeForComparison` (review hardening item 3): ObjectId→hex,
 * Date→ISO-8601, strip Mongoose internals, sort object keys deterministically.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, normalizeForComparison, diff } from '../../src/modules/patients/shadow-diff.js';

const base = { locationId: 'loc-1', patientId: 42, contactId: 'c-1' };

// ── normalize + diff (core shadow logic) ─────────────────────────────────────

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

// ── normalizeForComparison (review hardening item 3) ─────────────────────────

test('normalizeForComparison: ObjectId duck-typed to hex string', () => {
  const fakeObjectId = { toHexString: () => 'abc123' };
  assert.equal(normalizeForComparison(fakeObjectId), 'abc123');
});

test('normalizeForComparison: Date to ISO-8601 string', () => {
  const d = new Date('2026-01-15T12:00:00.000Z');
  assert.equal(normalizeForComparison(d), '2026-01-15T12:00:00.000Z');
});

test('normalizeForComparison: strips Mongoose internals (_id, __v)', () => {
  const doc = { locationId: 'loc', _id: 'oid', __v: 0, patientId: 1 };
  const result = normalizeForComparison(doc) as Record<string, unknown>;
  assert.ok(!('_id' in result), '_id must be stripped');
  assert.ok(!('__v' in result), '__v must be stripped');
  assert.equal(result.locationId, 'loc');
});

test('normalizeForComparison: sorts object keys deterministically', () => {
  const a = normalizeForComparison({ z: 1, a: 2 }) as Record<string, unknown>;
  const b = normalizeForComparison({ a: 2, z: 1 }) as Record<string, unknown>;
  assert.deepEqual(Object.keys(a), ['a', 'z']);
  assert.deepEqual(a, b);
});

test('normalizeForComparison: null/undefined returns null', () => {
  assert.equal(normalizeForComparison(null), null);
  assert.equal(normalizeForComparison(undefined), null);
});

test('normalizeForComparison + normalize: raw Mongo doc with ObjectId produces clean diff', () => {
  // Simulate a raw .lean() doc with ObjectId _id and Date updatedAt — no spurious diffs.
  const rawMongoDoc = {
    _id: { toHexString: () => 'abc123' },
    __v: 0,
    locationId: 'loc-1',
    patientId: 42,
    contactId: 'c-1',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const pgResult = { locationId: 'loc-1', patientId: 42, contactId: 'c-1' };
  // Replicate shadow.ts readMongo flow: deep-normalize raw doc, then project.
  const deepNorm = normalizeForComparison(rawMongoDoc) as Record<string, unknown>;
  const mongoNorm = normalize(deepNorm as never);
  const pgNorm = normalize({ ...pgResult });
  const diffs = diff(mongoNorm, pgNorm);
  assert.equal(diffs.length, 0, 'no spurious diffs from ObjectId/Date types');
});
