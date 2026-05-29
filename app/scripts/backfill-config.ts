/**
 * backfill-config.ts — one-shot Mongo → PG backfill for the config module.
 *
 * Reads every doc from the Mongo `clientAppConfigs` collection and upserts it
 * into PG (locations + config + location_config_tables), keyed on `mongo_id`
 * (the hex string of the Mongo `_id`). Idempotent: re-running produces zero net
 * change. Resumable: docs are streamed in `_id` order, each upsert is independent,
 * so a crash mid-run is recovered by simply re-running.
 *
 * Usage:
 *   tsx scripts/backfill-config.ts [--dry-run]
 *
 * RUN BY THE ORCHESTRATOR IN PROD (prod PG is internal to Coolify). Requires
 * MONGO_* + DATABASE_URL env (same as the app).
 */
import mongoose from 'mongoose';
import { eq } from 'drizzle-orm';
import { config as appConfig } from '../src/config.js';
import { db, sql } from '../src/db/pg/client.js';
import {
  locations,
  config as configTable,
  locationConfigTables,
} from '../src/db/pg/schema/config.js';

const DRY_RUN = process.argv.includes('--dry-run');

interface MongoTable {
  Name?: string;
  UniqueField?: string;
  formattedQuery?: string;
  SqlQuery?: string;
  Endpoint?: string;
}
interface MongoConfigDoc {
  _id: mongoose.Types.ObjectId;
  location?: string;
  config?: {
    LastRun?: string;
    DBProvider?: string;
    UseCacheTable?: boolean;
    TokenRefreshMilliseconds?: number;
    AuthEndpoint?: string;
    NotificationEndpoint?: string;
    PatientEndpoint?: string;
    AppointmentEndpoint?: string;
    ConnectionString?: string;
    RepeatMilliseconds?: number;
    MaxBatchSize?: number;
    Software?: string;
    Tables?: MongoTable[];
  };
}

function log(msg: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  console.log(extra ? `[${ts}] ${msg} ${JSON.stringify(extra)}` : `[${ts}] ${msg}`);
}

/** Upsert one Mongo doc into PG. Returns 'inserted' | 'updated' | 'skipped'. */
async function upsertDoc(doc: MongoConfigDoc): Promise<'inserted' | 'updated' | 'skipped'> {
  const mongoId = doc._id.toString();
  const location = doc.location;
  if (!location) {
    log('SKIP doc without location', { mongoId });
    return 'skipped';
  }
  const body = doc.config ?? {};

  if (DRY_RUN) return 'inserted';

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(locations).where(eq(locations.mongoId, mongoId));
    const isUpdate = existing.length > 0;

    const [loc] = await tx
      .insert(locations)
      .values({ mongoId, location, software: body.Software ?? null })
      .onConflictDoUpdate({
        target: locations.mongoId,
        set: { location, software: body.Software ?? null },
      })
      .returning();

    const cfgValues = {
      mongoId,
      locationId: loc.id,
      lastRun: body.LastRun ?? null,
      dbProvider: body.DBProvider ?? null,
      useCacheTable: body.UseCacheTable ?? null,
      tokenRefreshMilliseconds: body.TokenRefreshMilliseconds ?? null,
      authEndpoint: body.AuthEndpoint ?? null,
      notificationEndpoint: body.NotificationEndpoint ?? null,
      patientEndpoint: body.PatientEndpoint ?? null,
      appointmentEndpoint: body.AppointmentEndpoint ?? null,
      connectionString: body.ConnectionString ?? null,
      repeatMilliseconds: body.RepeatMilliseconds ?? null,
      maxBatchSize: body.MaxBatchSize ?? null,
      software: body.Software ?? null,
    };

    const [cfg] = await tx
      .insert(configTable)
      .values(cfgValues)
      .onConflictDoUpdate({ target: configTable.locationId, set: cfgValues })
      .returning();

    // Replace embedded Tables[] wholesale (matches Mongo doc-overwrite semantics).
    await tx.delete(locationConfigTables).where(eq(locationConfigTables.configId, cfg.id));
    const tables = body.Tables ?? [];
    if (tables.length > 0) {
      await tx.insert(locationConfigTables).values(
        tables.map((t) => ({
          configId: cfg.id,
          name: t.Name ?? '',
          uniqueField: t.UniqueField ?? '',
          formattedQuery: t.formattedQuery ?? null,
          sqlQuery: t.SqlQuery ?? '',
          endpoint: t.Endpoint ?? null,
        })),
      );
    }

    return isUpdate ? 'updated' : 'inserted';
  });
}

async function run() {
  log(`backfill-config starting${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);

  await mongoose.connect(appConfig.mongoConnString);
  const coll = mongoose.connection.collection<MongoConfigDoc>('clientAppConfigs');

  const total = await coll.countDocuments({});
  log('source row count', { mongo_clientAppConfigs: total });

  const counts = { inserted: 0, updated: 0, skipped: 0, processed: 0 };
  const cursor = coll.find({}).sort({ _id: 1 });

  for await (const doc of cursor) {
    const result = await upsertDoc(doc);
    counts[result]++;
    counts.processed++;
    if (counts.processed % 50 === 0) log('progress', counts);
  }

  let pgLocations = 0;
  if (!DRY_RUN) {
    const rows = await db.select().from(locations);
    pgLocations = rows.length;
  }

  log('backfill complete', { ...counts, pg_locations: pgLocations, dry_run: DRY_RUN });

  await mongoose.disconnect();
  await sql.end();
}

run().catch(async (err) => {
  console.error('backfill-config failed', err);
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
