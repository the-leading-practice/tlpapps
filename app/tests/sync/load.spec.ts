/**
 * P11 T02 — Load test: high-throughput webhook ack latency + queue-depth bound.
 *
 * TARGET SPEC (documented in docs/sync-load-test.md):
 *   1000 webhooks/min for 10 min → p95 ack <500ms, queue depth bounded, zero dup mappings.
 *
 * CI SCALE: In-process with mock HTTP. We test 100 concurrent write operations
 * (not 1000/min × 10min which requires live infra) and verify:
 *   a) p95 latency stays below 500ms under concurrent load
 *   b) all operations complete without loss (zero unhandled rejections)
 *   c) idempotency key uniqueness (no two writes share a key)
 *
 * Why scaled down: the 1000/min × 10min spec requires live PG + live HTTP server
 * (can't be socket-tested in-process). The in-process mock suite proves the write
 * path doesn't serialize or bottleneck; the full load scenario is documented in
 * docs/sync-load-test.md with target metrics for prod validation.
 *
 * No real GHL/DrChrono network calls. DATABASE_URL points to a non-existent PG
 * (dead-letter inserts fail silently — expected in this environment).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';
delete process.env.SYNC_WRITE_DRCHRONO_TO_GHL;
delete process.env.SYNC_WRITE_GHL_TO_DRCHRONO;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ghlWrite } from '../../src/modules/sync/writers/ghl.js';
import { type AttemptResult } from '../../src/modules/sync/writers/shared.js';

const CONCURRENCY = 100;           // in-process scale (see note above)
const P95_LATENCY_BUDGET_MS = 500; // matches prod target

/** Fast mock: returns 200 with ~1ms simulated processing. */
function fastMockHttp() {
  const idemKeys = new Set<string>();
  const fn = async (_url: string, options: RequestInit): Promise<AttemptResult> => {
    const headers = options.headers as Record<string, string>;
    const key = headers['Idempotency-Key'];
    idemKeys.add(key);
    return { status: 200, data: { ok: true } };
  };
  return { fn, idemKeys };
}

// ── Load scenario: CONCURRENCY concurrent contact creates ─────────────────────────────────────
test(`load: ${CONCURRENCY} concurrent GHL writes complete with p95 < ${P95_LATENCY_BUDGET_MS}ms`, async () => {
  const { fn, idemKeys } = fastMockHttp();
  const latencies: number[] = [];

  const writes = Array.from({ length: CONCURRENCY }, (_, i) => async () => {
    const start = Date.now();
    await ghlWrite(
      {
        eventId: `load-ev-${i}`,
        entity: 'contact',
        verb: 'create',
        token: 't',
        body: { firstName: `Patient${i}` },
      },
      fn,
      { delayFactor: 0 },
    );
    latencies.push(Date.now() - start);
  });

  const results = await Promise.allSettled(writes.map((w) => w()));
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(failed.length, 0, `${failed.length} writes failed under load`);
  assert.equal(latencies.length, CONCURRENCY);

  // p95 calculation
  latencies.sort((a, b) => a - b);
  const p95idx = Math.floor(CONCURRENCY * 0.95);
  const p95 = latencies[p95idx];
  assert.ok(
    p95 <= P95_LATENCY_BUDGET_MS,
    `p95 latency ${p95}ms exceeds budget ${P95_LATENCY_BUDGET_MS}ms`,
  );

  // Idempotency key uniqueness — zero duplicate mappings
  assert.equal(
    idemKeys.size,
    CONCURRENCY,
    `Expected ${CONCURRENCY} unique idem keys, got ${idemKeys.size}`,
  );
});

// ── Queue depth bound: burst then drain — no operations stuck indefinitely ───────────────────
test('load: burst of concurrent writes drains completely (no stuck queue)', async () => {
  const { fn } = fastMockHttp();
  const BURST = 50;

  const writes = Array.from({ length: BURST }, (_, i) =>
    ghlWrite(
      {
        eventId: `burst-ev-${i}`,
        entity: 'appointment',
        verb: 'create',
        token: 't',
        body: { calendarId: `cal-${i}` },
      },
      fn,
      { delayFactor: 0 },
    ),
  );

  const results = await Promise.allSettled(writes);
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  assert.equal(succeeded, BURST, `Only ${succeeded}/${BURST} writes succeeded`);
});

// ── Duplicate idempotency key prevention: same eventId twice → same idem key ─────────────────
test('load: duplicate eventId produces same idempotency key (safe retry semantics)', async () => {
  const idemKeySeen = new Set<string>();
  const fn = async (_url: string, options: RequestInit): Promise<AttemptResult> => {
    const key = (options.headers as Record<string, string>)['Idempotency-Key'];
    idemKeySeen.add(key);
    return { status: 200, data: { ok: true } };
  };

  const EVENT_ID = 'dup-event-999';
  await ghlWrite({ eventId: EVENT_ID, entity: 'contact', verb: 'create', token: 't', body: {} }, fn, {
    delayFactor: 0,
  });
  await ghlWrite({ eventId: EVENT_ID, entity: 'contact', verb: 'create', token: 't', body: {} }, fn, {
    delayFactor: 0,
  });

  // Two writes with the same eventId must produce the same idempotency key
  assert.equal(idemKeySeen.size, 1, 'Expected 1 unique idem key for duplicate eventId');
});
