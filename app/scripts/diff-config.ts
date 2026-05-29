/**
 * diff-config.ts — pre-cutover verification for the config module migration.
 *
 * Pulls every config row from BOTH Mongo (clientAppConfigs) and PG (via the PG
 * repo, which reassembles the nested {location,config:{...}} shape), normalizes
 * each (drops _id / mongo-internal keys, coerces timestamp-ish values to ms,
 * sorts Tables[]), then compares field-by-field keyed on `location`.
 *
 * Prints a single JSON object to stdout:
 *   { matched, missing_in_pg, missing_in_mongo, field_diffs, details }
 * A clean cutover requires missing_in_pg + missing_in_mongo + field_diffs == 0.
 *
 * Usage:  tsx scripts/diff-config.ts
 * RUN BY THE ORCHESTRATOR IN PROD (prod PG is internal to Coolify).
 */
import mongoose from 'mongoose';
import { config as appConfig } from '../src/config.js';
import { sql } from '../src/db/pg/client.js';
import { pgConfigRepo } from '../src/modules/config/repo.pg.js';
import type { ConfigDoc, ConfigTable } from '../src/modules/config/types.js';

/** Coerce Date / ISO-string / epoch-ish to a comparable ms number; pass others through. */
function normVal(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const t = Date.parse(v);
    // Only treat as a timestamp if it round-trips to the same ISO string.
    if (!Number.isNaN(t) && new Date(t).toISOString() === new Date(v).toISOString()) return t;
    return v;
  }
  return v;
}

function normTables(tables: ConfigTable[] | undefined): unknown[] {
  if (!tables) return [];
  return [...tables]
    .map((t) => ({
      Name: t.Name ?? null,
      UniqueField: t.UniqueField ?? null,
      formattedQuery: t.formattedQuery ?? null,
      SqlQuery: t.SqlQuery ?? null,
      Endpoint: t.Endpoint ?? null,
    }))
    .sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
}

/** Reduce a config doc to a stable, comparable plain object (ignores _id, key order). */
function normalize(doc: ConfigDoc): Record<string, unknown> {
  const body = doc.config ?? {};
  const out: Record<string, unknown> = { location: doc.location };
  const scalarKeys = [
    'LastRun',
    'DBProvider',
    'UseCacheTable',
    'TokenRefreshMilliseconds',
    'AuthEndpoint',
    'NotificationEndpoint',
    'PatientEndpoint',
    'AppointmentEndpoint',
    'ConnectionString',
    'RepeatMilliseconds',
    'MaxBatchSize',
    'Software',
  ] as const;
  for (const k of scalarKeys) {
    const v = (body as Record<string, unknown>)[k];
    out[k] = v === undefined ? null : normVal(v);
  }
  out.Tables = normTables(body.Tables);
  return out;
}

function diffFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, { mongo: unknown; pg: unknown }> {
  const diffs: Record<string, { mongo: unknown; pg: unknown }> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = JSON.stringify(a[k] ?? null);
    const bv = JSON.stringify(b[k] ?? null);
    if (av !== bv) diffs[k] = { mongo: a[k] ?? null, pg: b[k] ?? null };
  }
  return diffs;
}

async function run() {
  await mongoose.connect(appConfig.mongoConnString);
  const coll = mongoose.connection.collection<ConfigDoc>('clientAppConfigs');
  const mongoDocs = await coll.find({}).toArray();
  const mongoByLoc = new Map<string, Record<string, unknown>>();
  for (const d of mongoDocs) {
    if (d.location) mongoByLoc.set(d.location, normalize(d as unknown as ConfigDoc));
  }

  const pgDocs = await pgConfigRepo.getAllConfigs();
  const pgByLoc = new Map<string, Record<string, unknown>>();
  for (const d of pgDocs) pgByLoc.set(d.location, normalize(d));

  const result = {
    matched: 0,
    missing_in_pg: 0,
    missing_in_mongo: 0,
    field_diffs: 0,
    details: {
      missing_in_pg: [] as string[],
      missing_in_mongo: [] as string[],
      field_diffs: {} as Record<string, Record<string, { mongo: unknown; pg: unknown }>>,
    },
  };

  for (const [loc, mDoc] of mongoByLoc) {
    const pDoc = pgByLoc.get(loc);
    if (!pDoc) {
      result.missing_in_pg++;
      result.details.missing_in_pg.push(loc);
      continue;
    }
    const diffs = diffFields(mDoc, pDoc);
    if (Object.keys(diffs).length > 0) {
      result.field_diffs++;
      result.details.field_diffs[loc] = diffs;
    } else {
      result.matched++;
    }
  }
  for (const loc of pgByLoc.keys()) {
    if (!mongoByLoc.has(loc)) {
      result.missing_in_mongo++;
      result.details.missing_in_mongo.push(loc);
    }
  }

  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  await sql.end();
}

run().catch(async (err) => {
  console.error('diff-config failed', err);
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
