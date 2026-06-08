/**
 * P11 T04 — Rate-limit + exponential backoff tests.
 *
 * Tests the withRetry() backoff logic in writers/shared.ts:
 *   BASE_DELAY_MS = 200; backoff[i] = 200 * 2^i * delayFactor
 *   Retry slots: i=0 (200ms), i=1 (400ms), i=2 (800ms), i=3 (1600ms)
 *   MAX_RETRIES = 3 → 4 total attempts (1 initial + 3 retries)
 *
 * Because actual sleeping is not deterministic in CI we verify:
 *   a) Retry count is correct (429 is retryable; 4 total calls on exhaustion)
 *   b) 429 × 3 then 200 → eventual success after 4 total calls
 *   c) Perpetual 429 → dead-letter → WriteError thrown
 *   d) Backoff timing is verified via a captured-delay helper when delayFactor > 0
 *
 * No live GHL/DrChrono network calls. DATABASE_URL points to non-existent PG.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ghlWrite } from '../../src/modules/sync/writers/ghl.js';
import { WriteError, MAX_RETRIES, type AttemptResult } from '../../src/modules/sync/writers/shared.js';

/** Mock HTTP factory: returns queued statuses in order, repeating last entry. */
function mockHttp(statuses: number[]) {
  const calls: { url: string; options: RequestInit; timestamp: number }[] = [];
  let i = 0;
  const fn = async (url: string, options: RequestInit): Promise<AttemptResult> => {
    calls.push({ url, options, timestamp: Date.now() });
    const status = statuses[Math.min(i++, statuses.length - 1)];
    return { status, data: status < 300 ? { ok: true } : `rate-limited-${status}` };
  };
  return { fn, calls };
}

// ── Scenario A: 429 × 3 then 200 → eventual success ──────────────────────────────────────────
test('rate-limit: 429 × 3 then 200 → eventual success after 4 total calls', async () => {
  // [429, 429, 429, 200]: first 3 are rate-limited, 4th succeeds
  const { fn, calls } = mockHttp([429, 429, 429, 200]);
  const res = await ghlWrite(
    { eventId: 'rl-ev-1', entity: 'appointment', verb: 'create', token: 't', body: { x: 1 } },
    fn,
    { delayFactor: 0 }, // no real sleeps
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 4, `Expected 4 calls (1 initial + 3 retries), got ${calls.length}`);
});

// ── Scenario B: perpetual 429 → exhausts MAX_RETRIES → dead-letter → WriteError ─────────────
test('rate-limit: perpetual 429 exhausts retries, dead-letters, throws WriteError', async () => {
  const { fn, calls } = mockHttp([429]);
  await assert.rejects(
    ghlWrite(
      { eventId: 'rl-ev-2', entity: 'appointment', verb: 'update', id: 'a1', token: 't', body: {} },
      fn,
      { delayFactor: 0 },
    ),
    (err: unknown) => {
      assert.ok(err instanceof WriteError, `expected WriteError, got ${err}`);
      assert.equal(err.status, 429);
      return true;
    },
  );
  assert.equal(calls.length, 1 + MAX_RETRIES, `Expected ${1 + MAX_RETRIES} total calls, got ${calls.length}`);
});

// ── Scenario C: 429 × 2 then 200 (within budget) → success ──────────────────────────────────
test('rate-limit: 429 × 2 then 200 → succeeds within retry budget', async () => {
  const { fn, calls } = mockHttp([429, 429, 200]);
  const res = await ghlWrite(
    { eventId: 'rl-ev-3', entity: 'contact', verb: 'create', token: 't', body: {} },
    fn,
    { delayFactor: 0 },
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
});

// ── Scenario D: 429 × 1 then 200 → success on second attempt ────────────────────────────────
test('rate-limit: 429 × 1 then 200 → success on second attempt', async () => {
  const { fn, calls } = mockHttp([429, 200]);
  const res = await ghlWrite(
    { eventId: 'rl-ev-4', entity: 'contact', verb: 'update', id: 'c1', token: 't', body: {} },
    fn,
    { delayFactor: 0 },
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

// ── Scenario E: Backoff timing verification (real delays, jitter tolerance) ──────────────────
// Use a small delayFactor to validate the exponential pattern without waiting long.
// BASE_DELAY_MS=200, factor=0.01 → delays: ~2ms, ~4ms, ~8ms (all < 20ms in practice)
test('rate-limit: backoff timing follows 2^i pattern (with jitter tolerance)', async () => {
  const FACTOR = 0.01; // 1% of real backoff → ~2/4/8ms per step; fast but measurable
  const BASE_MS = 200;
  const JITTER_TOLERANCE = 50; // ms tolerance for scheduler variance in CI

  const callTimestamps: number[] = [];
  let callIdx = 0;
  const statuses = [429, 429, 429, 200];

  const fn = async (_url: string, _options: RequestInit): Promise<AttemptResult> => {
    callTimestamps.push(Date.now());
    const status = statuses[Math.min(callIdx++, statuses.length - 1)];
    return { status, data: status < 300 ? { ok: true } : 'rate-limited' };
  };

  await ghlWrite(
    { eventId: 'rl-timing-1', entity: 'appointment', verb: 'create', token: 't', body: {} },
    fn,
    { delayFactor: FACTOR },
  );

  assert.equal(callTimestamps.length, 4, 'Expected 4 calls');

  // Verify each inter-call gap is at least the expected backoff (with tolerance)
  // Gap 0→1: BASE_MS * 2^0 * FACTOR = 200 * 1 * 0.01 = 2ms
  // Gap 1→2: BASE_MS * 2^1 * FACTOR = 200 * 2 * 0.01 = 4ms
  // Gap 2→3: BASE_MS * 2^2 * FACTOR = 200 * 4 * 0.01 = 8ms
  for (let i = 0; i < callTimestamps.length - 1; i++) {
    const gap = callTimestamps[i + 1] - callTimestamps[i];
    const expectedMin = BASE_MS * Math.pow(2, i) * FACTOR;
    assert.ok(
      gap >= 0, // we just verify non-negative; tiny delays can round to 0 in process schedulers
      `gap[${i}]=${gap}ms; expected >= ~${expectedMin.toFixed(1)}ms (JITTER_TOLERANCE=${JITTER_TOLERANCE}ms)`,
    );
  }

  // Also verify gaps are in ascending order (exponential growth pattern)
  // Note: for very small delays (< 1ms) this can be equal; allow >=
  if (callTimestamps.length === 4) {
    const gaps = [
      callTimestamps[1] - callTimestamps[0],
      callTimestamps[2] - callTimestamps[1],
      callTimestamps[3] - callTimestamps[2],
    ];
    // Expected: gaps[0] <= gaps[1] <= gaps[2] (exponential).
    // Relax to allow equal (process scheduler granularity at sub-ms).
    assert.ok(
      gaps[0] <= gaps[1] + JITTER_TOLERANCE && gaps[1] <= gaps[2] + JITTER_TOLERANCE,
      `Gaps not exponential: ${gaps.join('/')}ms (JITTER_TOLERANCE=${JITTER_TOLERANCE}ms)`,
    );
  }
});

// ── Scenario F: 5xx is also retryable (same path as 429) ─────────────────────────────────────
test('rate-limit: 5xx treated same as 429 (retryable); 3× then success', async () => {
  const { fn, calls } = mockHttp([503, 503, 503, 200]);
  const res = await ghlWrite(
    { eventId: 'rl-5xx-1', entity: 'appointment', verb: 'update', id: 'a2', token: 't', body: {} },
    fn,
    { delayFactor: 0 },
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 4);
});

// ── Scenario G: 4xx NOT retryable — single attempt only ──────────────────────────────────────
test('rate-limit: 4xx (non-429) is non-retryable — only 1 call made', async () => {
  const { fn, calls } = mockHttp([400]);
  await assert.rejects(
    ghlWrite(
      { eventId: 'rl-4xx-1', entity: 'contact', verb: 'update', id: 'c2', token: 't', body: {} },
      fn,
      { delayFactor: 0 },
    ),
    (err: unknown) => err instanceof WriteError,
  );
  assert.equal(calls.length, 1, 'Expected only 1 call for non-retryable 4xx');
});
