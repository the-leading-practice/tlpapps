/**
 * verify-suppression harness — unit tests for the pure Phase A / guard logic.
 *
 * No network, no DB. Covers:
 *   - the demo-location guard (isDemoRunAllowed) — proves Phase B CANNOT fire without
 *     --live AND an allowlisted demo location.
 *   - synthetic payload labelling (buildSyntheticContacts).
 *   - arg parsing.
 *
 * The Phase A runtime body assertion is exercised end-to-end by suppression.spec.ts
 * (verify-mode envelope already asserts tag + dnd); these tests cover the harness's own
 * decision logic so a regression that loosens the guard is caught.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArgs,
  isDemoRunAllowed,
  buildSyntheticContacts,
} from '../../scripts/verify-suppression.js';

// ── Guard: Phase B cannot fire without --live ─────────────────────────────────
test('guard: refuses without --live', () => {
  const r = isDemoRunAllowed(parseArgs(['--location', 'wP3Ynm3Z63rIC4zVAgXP']));
  assert.equal(r.ok, false);
  assert.match(r.reason!, /live/i);
});

test('guard: refuses --live without a location', () => {
  const r = isDemoRunAllowed(parseArgs(['--live']));
  assert.equal(r.ok, false);
  assert.match(r.reason!, /location/i);
});

// ── Guard: only the demo location is allowed ──────────────────────────────────
test('guard: refuses a non-demo location even with --live', () => {
  const r = isDemoRunAllowed(parseArgs(['--live', '--location', 'PRODabc123XYZ']));
  assert.equal(r.ok, false);
  assert.match(r.reason!, /not in the demo allowlist|refusing/i);
});

test('guard: allows ONLY the exact demo location with --live', () => {
  const r = isDemoRunAllowed(parseArgs(['--live', '--location', 'wP3Ynm3Z63rIC4zVAgXP']));
  assert.deepEqual(r, { ok: true });
});

test('guard: a near-miss of the demo id is refused', () => {
  const r = isDemoRunAllowed(parseArgs(['--live', '--location', 'wP3Ynm3Z63rIC4zVAgX']));
  assert.equal(r.ok, false);
});

// ── Arg parsing ───────────────────────────────────────────────────────────────
test('parseArgs: defaults are Phase-A-only, count 3', () => {
  assert.deepEqual(parseArgs([]), { live: false, location: null, count: 3 });
});

test('parseArgs: --count parsed, invalid falls back to 3', () => {
  assert.equal(parseArgs(['--count', '7']).count, 7);
  assert.equal(parseArgs(['--count', 'nope']).count, 3);
  assert.equal(parseArgs(['--count', '-2']).count, 3);
});

// ── Synthetic payloads are clearly labelled + unique ──────────────────────────
test('buildSyntheticContacts: clearly labelled, unique, pre-tagged for merge proof', () => {
  const c = buildSyntheticContacts(3, 'run1');
  assert.equal(c.length, 3);
  for (const x of c) {
    assert.match(String(x.firstName), /^ZZ_SUPPRESS_TEST_/);
    assert.match(String(x.email), /@suppress-test\.invalid$/);
    // pre-existing tag present so the harness proves the suppress tag MERGES not replaces
    assert.deepEqual(x.tags, ['VIP']);
  }
  // unique emails
  const emails = new Set(c.map((x) => x.email));
  assert.equal(emails.size, 3);
});
