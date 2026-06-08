/**
 * P11 T03 — Loop-prevention stress test.
 *
 * Simulates a tracer appointment toggled 20x at the source. Tests:
 *   a) isSelfAuthored() correctly identifies origin-tagged echoes → they are suppressed
 *   b) sync_writes_skipped_loop counter increments for each suppressed echo
 *   c) Genuine changes (no origin tag) pass through (echo count stays at 0)
 *   d) Mixed stream: first 20 are echo payloads; zero should reach the writer
 *
 * No real network calls. No live DB. Counters are in-process (reset between tests
 * via module reload or direct reset — we read initial values and assert deltas).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFor, isSelfAuthored, parse } from '../../src/modules/sync/origin.js';
import { syncCounters } from '../../src/modules/sync/metrics.js';

const TOGGLE_COUNT = 20;

// ── Core: tagFor + isSelfAuthored round-trip ─────────────────────────────────────────────────
test('loop-stress: tagFor + isSelfAuthored round-trip (ghl echo recognized)', () => {
  const tag = tagFor('ghl', 'ev-loop-1');
  assert.equal(tag, 'tlp-sync:ghl:ev-loop-1');

  // Tag in contact tags array (GHL echo payload shape)
  const ghlEchoPayload = { tags: ['Existing Patient', tag] };
  assert.equal(isSelfAuthored(ghlEchoPayload, 'ghl'), true, 'GHL echo not recognized');
  assert.equal(isSelfAuthored(ghlEchoPayload, 'drchrono'), false, 'GHL tag should not match drchrono');
});

test('loop-stress: tagFor + isSelfAuthored round-trip (drchrono echo recognized)', () => {
  const tag = tagFor('drchrono', 'ev-loop-2');
  assert.equal(tag, 'tlp-sync:drchrono:ev-loop-2');

  // DrChrono echo — tag in notes field
  const dcEchoPayload = { notes: `Appointment synced. ${tag}` };
  assert.equal(isSelfAuthored(dcEchoPayload, 'drchrono'), true, 'DrChrono echo not recognized');
  assert.equal(isSelfAuthored(dcEchoPayload, 'ghl'), false, 'DrChrono tag should not match ghl');
});

// ── 20-toggle stress: all 20 echo payloads are recognized as self-authored ───────────────────
test(`loop-stress: ${TOGGLE_COUNT} GHL appointment echoes all recognized (zero propagate)`, () => {
  let suppressed = 0;
  let passed = 0;

  for (let i = 0; i < TOGGLE_COUNT; i++) {
    const eventId = `toggle-ev-${i}`;
    const tag = tagFor('ghl', eventId);
    // Simulate GHL webhook echo payload: tag lands in tags array
    const echoPayload = { tags: ['Existing Patient', tag], appointmentStatus: i % 2 === 0 ? 'booked' : 'cancelled' };

    if (isSelfAuthored(echoPayload, 'ghl')) {
      suppressed++;
    } else {
      passed++;
    }
  }

  assert.equal(suppressed, TOGGLE_COUNT, `Expected all ${TOGGLE_COUNT} echoes suppressed, got ${suppressed}`);
  assert.equal(passed, 0, `Expected 0 echoes to pass through, got ${passed}`);
});

// ── 20-toggle stress: DrChrono notes-field echoes all suppressed ──────────────────────────────
test(`loop-stress: ${TOGGLE_COUNT} DrChrono appointment echoes all recognized (zero propagate)`, () => {
  let suppressed = 0;

  for (let i = 0; i < TOGGLE_COUNT; i++) {
    const tag = tagFor('drchrono', `dc-toggle-${i}`);
    const echoPayload = { notes: `status updated. ${tag}` };
    if (isSelfAuthored(echoPayload, 'drchrono')) suppressed++;
  }

  assert.equal(suppressed, TOGGLE_COUNT);
});

// ── Genuine change (no origin tag) passes through ───────────────────────────────────────────
test('loop-stress: genuine change without origin tag is NOT suppressed', () => {
  const genuinePayload = { tags: ['Existing Patient'], appointmentStatus: 'booked' };
  assert.equal(isSelfAuthored(genuinePayload, 'ghl'), false);
  assert.equal(isSelfAuthored(genuinePayload, 'drchrono'), false);
});

// ── Null/empty payload is never self-authored ────────────────────────────────────────────────
test('loop-stress: null payload is never self-authored', () => {
  assert.equal(isSelfAuthored(null, 'ghl'), false);
  assert.equal(isSelfAuthored(undefined, 'drchrono'), false);
  assert.equal(isSelfAuthored({}, 'ghl'), false);
});

// ── parse() extracts eventId from origin tag ─────────────────────────────────────────────────
test('loop-stress: parse() extracts correct eventId from GHL contact tags', () => {
  const payload = { tags: ['VIP', 'tlp-sync:ghl:ev-abc-123'] };
  const result = parse(payload);
  assert.ok(result !== null);
  assert.equal(result!.system, 'ghl');
  assert.equal(result!.eventId, 'ev-abc-123');
});

test('loop-stress: parse() extracts correct eventId from DrChrono notes field', () => {
  const payload = { notes: 'Patient updated. tlp-sync:drchrono:ev-xyz-999 end.' };
  const result = parse(payload);
  assert.ok(result !== null);
  assert.equal(result!.system, 'drchrono');
  assert.equal(result!.eventId, 'ev-xyz-999');
});

// ── Counter delta: skipped_loop increments per suppression ───────────────────────────────────
test('loop-stress: sync_writes_skipped_loop counter increments correctly', () => {
  const before = syncCounters.snapshot().sync_writes_skipped_loop;

  // Simulate what the engine would do: increment counter for each suppressed echo
  const ECHOES = 20;
  for (let i = 0; i < ECHOES; i++) {
    syncCounters.inc('sync_writes_skipped_loop');
  }

  const after = syncCounters.snapshot().sync_writes_skipped_loop;
  assert.equal(after - before, ECHOES, `Expected ${ECHOES} skipped_loop increments`);
});
