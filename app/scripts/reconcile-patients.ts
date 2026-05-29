/**
 * reconcile-patients.ts — nightly drift check for the patients dual-write (P04).
 *
 * For each location present in either store:
 *   - counts patient rows in Mongo (`patients` collection) and PG (`patients` table)
 *   - samples up to 100 patients by patientId, hashes a normalized field subset
 *     ({locationId, patientId, contactId}) on both sides, and diffs the hashes
 *   - computes a drift ratio = (count delta + hash mismatches) / max(mongo,pg)
 *
 * On drift > 0.1% for a location it emits a Telegram alert via the notifications
 * module. Always prints a single JSON report to stdout.
 *
 * Usage:   tsx scripts/reconcile-patients.ts [--location <loc>]
 * Schedule: the orchestrator wires this to a nightly cron (~03:15 UTC). This file
 *           is code-only; it is NEVER run against live PG by the implementing agent.
 *
 * NOTE (R-AUD-09): reconciliation queries the Mongo `locationId` field (lowercase,
 * the model's real field) — NOT the `LocationId` typo used by the broken
 * getPatients read. PG uses location_id. Both sides therefore key on the same value.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { sql as pgSql } from 'drizzle-orm';
import { config as appConfig } from '../src/config.js';
import { db } from '../src/db/pg/client.js';
import { sql } from '../src/db/pg/client.js';
import { patients as pgPatients } from '../src/db/pg/schema/patients.js';
import { telegramService } from '../src/modules/notifications/telegram.js';

const SAMPLE_SIZE = 100;
const DRIFT_THRESHOLD = 0.001; // 0.1%

type MongoPatient = { locationId: string; patientId: number; contactId?: string };
type Row = { locationId: string; patientId: number; contactId: string | null };

/** Stable hash of the comparable field subset. */
function hashRow(r: Row): string {
  const norm = {
    locationId: r.locationId,
    patientId: r.patientId,
    contactId: r.contactId ?? null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

type LocationReport = {
  location: string;
  mongo_count: number;
  pg_count: number;
  count_delta: number;
  sampled: number;
  hash_mismatches: number;
  drift_ratio: number;
  drift_exceeded: boolean;
};

async function reconcileLocation(location: string): Promise<LocationReport> {
  const coll = mongoose.connection.collection<MongoPatient>('patients');

  const [mongoCount, pgCountRows] = await Promise.all([
    coll.countDocuments({ locationId: location }),
    db
      .select({ n: pgSql<number>`count(*)::int` })
      .from(pgPatients)
      .where(pgSql`${pgPatients.locationId} = ${location}`),
  ]);
  const pgCount = pgCountRows[0]?.n ?? 0;

  // Sample up to SAMPLE_SIZE patients from Mongo, then fetch their PG counterparts.
  const sample = await coll
    .aggregate<MongoPatient>([
      { $match: { locationId: location } },
      { $sample: { size: SAMPLE_SIZE } },
    ])
    .toArray();

  let hashMismatches = 0;
  for (const m of sample) {
    const mongoHash = hashRow({
      locationId: m.locationId,
      patientId: m.patientId,
      contactId: m.contactId ?? null,
    });
    const [pgRow] = await db
      .select({
        locationId: pgPatients.locationId,
        patientId: pgPatients.patientId,
        contactId: pgPatients.contactId,
      })
      .from(pgPatients)
      .where(
        pgSql`${pgPatients.locationId} = ${location} and ${pgPatients.patientId} = ${m.patientId}`,
      );
    const pgHash = pgRow ? hashRow(pgRow) : '';
    if (pgHash !== mongoHash) hashMismatches++;
  }

  const denom = Math.max(mongoCount, pgCount, 1);
  const countDelta = Math.abs(mongoCount - pgCount);
  const driftRatio = (countDelta + hashMismatches) / denom;

  return {
    location,
    mongo_count: mongoCount,
    pg_count: pgCount,
    count_delta: countDelta,
    sampled: sample.length,
    hash_mismatches: hashMismatches,
    drift_ratio: driftRatio,
    drift_exceeded: driftRatio > DRIFT_THRESHOLD,
  };
}

async function run() {
  const locArg = process.argv.indexOf('--location');
  const onlyLocation = locArg >= 0 ? process.argv[locArg + 1] : null;

  await mongoose.connect(appConfig.mongoConnString);
  const coll = mongoose.connection.collection<MongoPatient>('patients');

  // Locations = union of Mongo + PG distinct locationIds (or the single --location).
  let locations: string[];
  if (onlyLocation) {
    locations = [onlyLocation];
  } else {
    const [mongoLocs, pgLocs] = await Promise.all([
      coll.distinct('locationId'),
      db.selectDistinct({ locationId: pgPatients.locationId }).from(pgPatients),
    ]);
    const set = new Set<string>([
      ...(mongoLocs as string[]),
      ...pgLocs.map((r) => r.locationId),
    ]);
    locations = [...set];
  }

  const reports: LocationReport[] = [];
  for (const loc of locations) {
    reports.push(await reconcileLocation(loc));
  }

  // Alert on drift via Telegram (notifications module).
  for (const r of reports.filter((r) => r.drift_exceeded)) {
    telegramService.sendMessage({
      severity: 'Warn',
      location: r.location,
      name: 'reconcile-patients',
      timestamp: new Date().toISOString(),
      message: `Patient dual-write drift ${(r.drift_ratio * 100).toFixed(2)}% (mongo=${r.mongo_count} pg=${r.pg_count} mismatches=${r.hash_mismatches})`,
    });
  }

  console.log(
    JSON.stringify(
      { threshold: DRIFT_THRESHOLD, locations: reports.length, drifted: reports.filter((r) => r.drift_exceeded).length, reports },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
  await sql.end();
}

run().catch(async (err) => {
  console.error('reconcile-patients failed', err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  try {
    await sql.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
