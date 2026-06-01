/**
 * P08 T05 — idempotency proof.
 *
 * Inserts the SAME sync event (same `dedup_key`) 100 times, runs the engine, and
 * asserts that exactly ONE sync_mappings row and ONE appointment_links row result —
 * i.e. re-processing an event yields zero net state change. This is the load-bearing
 * guarantee for at-least-once webhook/cron delivery (P09).
 *
 * Requires a reachable Postgres with the P07 sync schema migrated. This test
 * connects to a REAL database and is therefore OPT-IN ONLY: it runs solely when
 * RUN_DB_TESTS=1 is set. The default offline suite must never reach live infra, and
 * the test bootstrap (tests/setup.mjs) sets a sentinel DATABASE_URL so config loads
 * without a DB — sniffing DATABASE_URL would falsely enable this test. Gating on an
 * explicit flag keeps the offline run deterministic and prod-safe. Self-cleaning:
 * scopes all rows to a unique GHL event id and deletes them on teardown.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const HAS_DB = process.env.RUN_DB_TESTS === '1';

// A unique GHL event id namespaces every row this test creates.
const GHL_EVENT_ID = `test-appt-${Date.now()}`;
const DEDUP_KEY = `ghl:created:${GHL_EVENT_ID}:1`;

test('same dedup_key processed 100x => exactly one mapping + one link', { skip: !HAS_DB }, async () => {
  const { db } = await import('../../src/db/pg/client.js');
  const { sql } = await import('../../src/db/pg/client.js');
  const { syncEvents, syncMappings, appointmentLinks } = await import(
    '../../src/db/pg/schema/sync.js'
  );
  const { Leader } = await import('../../src/modules/sync/leader.js');
  const { processBatch } = await import('../../src/modules/sync/engine.js');
  const { eq } = await import('drizzle-orm');

  const payload = {
    id: GHL_EVENT_ID,
    calendarId: 'cal-1',
    contactId: 'contact-1',
    startTime: '2026-06-01T15:00:00Z',
    endTime: '2026-06-01T15:30:00Z',
    appointmentStatus: 'booked',
  };

  // Clean any prior residue for this id.
  await cleanup(db, sql, syncEvents, appointmentLinks, syncMappings, eq);

  // Attempt 100 inserts of the SAME dedup_key. The unique index on dedup_key means
  // only the first succeeds; the rest are no-ops (onConflictDoNothing) — this is the
  // ingest-side idempotency. We assert exactly one event row lands.
  for (let i = 0; i < 100; i++) {
    await db
      .insert(syncEvents)
      .values({
        source: 'ghl',
        action: 'created',
        payload,
        status: 'pending',
        dedupKey: DEDUP_KEY,
      })
      .onConflictDoNothing({ target: syncEvents.dedupKey });
  }

  const eventRows = await db
    .select()
    .from(syncEvents)
    .where(eq(syncEvents.dedupKey, DEDUP_KEY));
  assert.equal(eventRows.length, 1, 'dedup_key unique index must collapse 100 inserts to 1 event');

  // Run the engine repeatedly. Even reprocessing the (re-armed) event must not create
  // duplicate mapping/link rows — the engine upserts on the natural keys.
  const leader = new Leader('test_sync_engine');
  try {
    for (let pass = 0; pass < 3; pass++) {
      await processBatch(leader);
      // Re-arm to force reprocessing of the same event on the next pass.
      await db
        .update(syncEvents)
        .set({ status: 'pending', processedAt: null })
        .where(eq(syncEvents.dedupKey, DEDUP_KEY));
    }
  } finally {
    await leader.release();
  }

  const mappingRows = await db
    .select()
    .from(syncMappings)
    .where(eq(syncMappings.ghlId, GHL_EVENT_ID));
  assert.equal(mappingRows.length, 1, 'exactly one sync_mappings row for the event');

  const linkRows = await db
    .select()
    .from(appointmentLinks)
    .where(eq(appointmentLinks.ghlEventId, GHL_EVENT_ID));
  assert.equal(linkRows.length, 1, 'exactly one appointment_links row for the event');
});

before(() => {
  if (!HAS_DB) console.log('RUN_DB_TESTS!=1 — skipping idempotency DB test (needs live Postgres)');
});

after(async () => {
  if (!HAS_DB) return;
  const { db, sql } = await import('../../src/db/pg/client.js');
  const { syncEvents, syncMappings, appointmentLinks } = await import(
    '../../src/db/pg/schema/sync.js'
  );
  const { eq } = await import('drizzle-orm');
  await cleanup(db, sql, syncEvents, appointmentLinks, syncMappings, eq);
  await sql.end({ timeout: 5 });
});

async function cleanup(
  db: any,
  _sql: any,
  syncEvents: any,
  appointmentLinks: any,
  syncMappings: any,
  eq: any,
) {
  await db.delete(appointmentLinks).where(eq(appointmentLinks.ghlEventId, GHL_EVENT_ID));
  await db.delete(syncMappings).where(eq(syncMappings.ghlId, GHL_EVENT_ID));
  await db.delete(syncEvents).where(eq(syncEvents.dedupKey, DEDUP_KEY));
}
