/**
 * backfill-patients.ts — P05 T01 historical patient backfill (Mongo -> Postgres).
 *
 * Cursor-paged walk of the Mongo `patients` collection. Per document it upserts a
 * row into PG `patients` keyed on `mongo_id`, then derives `patient_external_ids`
 * rows from the per-system id fields present on the Mongo doc:
 *   contactId          -> (system='ghl')
 *   drchronoPatientId  -> (system='drchrono')   [only when the field is present]
 *   embodiId           -> (system='embodi')     [only when the field is present]
 *
 * The Mongo `patients` model today is { locationId, patientId, contactId } — only
 * the GHL contact id is guaranteed. DrChrono / Embodi ids are derived defensively
 * (other flows may stamp them on the doc); absent fields are simply skipped.
 *
 * Concurrency safety with the P04 dual-write: each row is skipped when the existing
 * PG row's `updated_at` is NEWER than the Mongo doc's `_id` timestamp (or its own
 * updatedAt if present) — the live dual-write must never be clobbered by an old
 * historical row. Upserts are idempotent on `mongo_id` (and the natural key
 * (location_id, patient_id)), so the script is safe to re-run any time.
 *
 * Resume: the last-seen Mongo `_id` is persisted to a cursor file after every batch
 * (`.cache/backfill-patients-cursor` by default). Re-invoking resumes after it.
 *
 * SAFETY: `--dry-run` fetches + derives + counts but writes NOTHING to PG and does
 * NOT advance the cursor file. A real run requires omitting `--dry-run`. This script
 * never mutates Mongo and never touches any EHR.
 *
 * Usage:
 *   tsx scripts/backfill-patients.ts --dry-run                 # read-only, no writes
 *   tsx scripts/backfill-patients.ts                           # real backfill
 *   tsx scripts/backfill-patients.ts --batch-size 1000        # tune page size
 *   tsx scripts/backfill-patients.ts --cursor-file ./x.cursor # custom cursor path
 *   tsx scripts/backfill-patients.ts --reset-cursor           # start from the top
 *   tsx scripts/backfill-patients.ts --location <ghlLocId>    # only that location's patients
 *
 * The implementing agent does NOT run a non-dry-run against any database — that is
 * the human-gated T04 step.
 */

import { logger } from '../src/logger.js';

const log = logger.child({ module: 'backfill-patients' });

// ── Args ──────────────────────────────────────────────────────────────────

export interface Args {
  dryRun: boolean;
  batchSize: number;
  cursorFile: string;
  resetCursor: boolean;
  location: string | null;
}

const DEFAULT_CURSOR_FILE = '.cache/backfill-patients-cursor';

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    batchSize: 500,
    cursorFile: DEFAULT_CURSOR_FILE,
    resetCursor: false,
    location: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--batch-size') {
      const n = parseInt(argv[++i] ?? '', 10);
      args.batchSize = Number.isFinite(n) && n > 0 ? n : 500;
    } else if (a === '--cursor-file') args.cursorFile = argv[++i] ?? DEFAULT_CURSOR_FILE;
    else if (a === '--reset-cursor') args.resetCursor = true;
    else if (a === '--location') {
      const v = (argv[++i] ?? '').trim();
      args.location = v.length > 0 ? v : null;
    }
  }
  return args;
}

// ── External-id derivation (pure, unit-tested) ──────────────────────────────

export type ExternalIdSystem = 'ghl' | 'drchrono' | 'embodi';

export interface DerivedExternalId {
  system: ExternalIdSystem;
  externalId: string;
}

/**
 * Map a (lean) Mongo patient doc to its `patient_external_ids` rows. Pure: no DB,
 * no side effects — this is the unit-tested core of the derivation. A field counts
 * only when it is a non-empty string (numbers are coerced to string for safety).
 *
 * Field -> system map (per P05 PLAN / P01 §14 legacy field names):
 *   contactId         -> ghl
 *   drchronoPatientId -> drchrono
 *   embodiId          -> embodi
 */
export function deriveExternalIds(doc: Record<string, unknown>): DerivedExternalId[] {
  const map: Array<[string, ExternalIdSystem]> = [
    ['contactId', 'ghl'],
    ['drchronoPatientId', 'drchrono'],
    ['embodiId', 'embodi'],
  ];
  const out: DerivedExternalId[] = [];
  for (const [field, system] of map) {
    const raw = doc[field];
    if (raw === null || raw === undefined) continue;
    const value = typeof raw === 'number' ? String(raw) : raw;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    out.push({ system, externalId: trimmed });
  }
  return out;
}

// ── Cursor persistence ──────────────────────────────────────────────────────

async function readCursor(file: string, reset: boolean): Promise<string | null> {
  if (reset) return null;
  const { readFile } = await import('node:fs/promises');
  try {
    const raw = (await readFile(file, 'utf8')).trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null; // no cursor yet => start from the top
  }
}

async function writeCursor(file: string, value: string): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, value, 'utf8');
}

// ── Summary ─────────────────────────────────────────────────────────────────

export interface Summary {
  scanned: number;
  upserted: number;
  skippedNewerPg: number;
  externalIds: number;
  batches: number;
}

// ── Main backfill (real run; DB-backed) ─────────────────────────────────────

async function run(args: Args): Promise<Summary> {
  // Lazy imports so unit tests of parseArgs/deriveExternalIds never open Mongo/PG.
  const mongoose = (await import('mongoose')).default;
  const { config } = await import('../src/config.js');
  const { PatientModel } = await import('../src/models/patient.js');
  const { db } = await import('../src/db/pg/client.js');
  const { patients, patientExternalIds } = await import('../src/db/pg/schema/patients.js');

  await mongoose.connect(config.mongoConnString);

  const summary: Summary = {
    scanned: 0,
    upserted: 0,
    skippedNewerPg: 0,
    externalIds: 0,
    batches: 0,
  };

  // Location-scoped runs get their own cursor namespace so a partial demo run can
  // never clobber (or resume from) a full-run cursor.
  const cursorFile =
    args.location && args.cursorFile === DEFAULT_CURSOR_FILE
      ? `${DEFAULT_CURSOR_FILE}-${args.location}`
      : args.cursorFile;

  let lastId = await readCursor(cursorFile, args.resetCursor);
  log.info(
    { ...args, cursorFile, resumeFrom: lastId, mode: args.dryRun ? 'DRY-RUN' : 'APPLY' },
    'backfill-patients starting',
  );

  // Cast to Types.ObjectId for the range filter when resuming.
  const { Types } = mongoose;

  for (;;) {
    const filter: Record<string, unknown> = lastId
      ? { _id: { $gt: new Types.ObjectId(lastId) } }
      : {};
    if (args.location) filter.locationId = args.location;
    const docs = await PatientModel.find(filter)
      .sort({ _id: 1 })
      .limit(args.batchSize)
      .lean<Record<string, unknown>[]>()
      .exec();

    if (docs.length === 0) break;
    summary.batches++;

    for (const doc of docs) {
      summary.scanned++;
      const mongoId = String(doc._id);
      lastId = mongoId;

      const locationId = typeof doc.locationId === 'string' ? doc.locationId : '';
      const patientIdRaw = doc.patientId;
      const patientId =
        typeof patientIdRaw === 'number' ? patientIdRaw : parseInt(String(patientIdRaw), 10);
      const contactId = typeof doc.contactId === 'string' ? doc.contactId : null;

      if (!locationId || !Number.isFinite(patientId)) {
        log.warn({ mongoId, locationId, patientId: patientIdRaw }, 'skipping malformed doc');
        continue;
      }

      // The Mongo doc's authoritative timestamp: prefer an explicit updatedAt,
      // else fall back to the ObjectId generation time.
      const mongoUpdatedAt =
        doc.updatedAt instanceof Date
          ? doc.updatedAt
          : new Types.ObjectId(mongoId).getTimestamp();

      const derived = deriveExternalIds(doc);

      if (args.dryRun) {
        summary.upserted++; // "would upsert"
        summary.externalIds += derived.length;
        continue;
      }

      await db.transaction(async (tx) => {
        // Concurrency guard (review item 1/2): the "PG newer than Mongo" skip lives
        // in the ON CONFLICT WHERE clause — no separate pre-SELECT needed. The
        // condition `patients.updatedAt < mongoUpdatedAt` means: only overwrite when
        // the existing PG row is OLDER than this historical Mongo doc. If the live
        // dual-write wrote a newer row, WHERE is false, PG does nothing — idempotent.
        const { lt } = await import('drizzle-orm');
        const [row] = await tx
          .insert(patients)
          .values({ mongoId, locationId, patientId, contactId, updatedAt: mongoUpdatedAt })
          .onConflictDoUpdate({
            target: [patients.locationId, patients.patientId],
            set: { contactId, mongoId, updatedAt: mongoUpdatedAt },
            where: lt(patients.updatedAt, mongoUpdatedAt),
          })
          .returning({ id: patients.id });

        if (!row) {
          // ON CONFLICT WHERE false: existing PG row is newer than Mongo doc; skip.
          summary.skippedNewerPg++;
          return;
        }

        for (const ext of derived) {
          await tx
            .insert(patientExternalIds)
            .values({ patientId: row.id, system: ext.system, externalId: ext.externalId })
            .onConflictDoUpdate({
              target: [patientExternalIds.system, patientExternalIds.externalId],
              set: { patientId: row.id },
            });
          summary.externalIds++;
        }
        summary.upserted++;
      });
    }

    if (!args.dryRun && lastId) await writeCursor(cursorFile, lastId);

    if (summary.scanned % 1000 < args.batchSize) {
      log.info({ ...summary }, 'backfill-patients progress');
    }
  }

  log.info({ ...summary, mode: args.dryRun ? 'dry-run' : 'apply' }, 'backfill-patients complete');

  await mongoose.disconnect();
  const { sql } = await import('../src/db/pg/client.js');
  await sql.end({ timeout: 5 });

  return summary;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const summary = await run(args);
  console.log(JSON.stringify({ mode: args.dryRun ? 'dry-run' : 'apply', summary }, null, 2));
}

// Only auto-run when invoked directly (not when imported by a test).
const isDirect = process.argv[1] && process.argv[1].endsWith('backfill-patients.ts');
if (isDirect) {
  main().catch((err) => {
    log.error({ err }, 'backfill-patients failed');
    process.exit(1);
  });
}
