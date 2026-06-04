/**
 * Patient shadow-read comparison (P05 T02).
 *
 * When reads are served from Postgres (`PATIENTS_READ_PRIMARY=pg`), the read
 * helper fires `compare(query, pgResult)` asynchronously (via setImmediate, never
 * awaited) so it adds ZERO latency to the request. `compare` re-runs the same
 * lookup against Mongo, normalizes both sides, diffs them, and on a real mismatch
 * inserts ONE row into `sync_conflicts` (source='shadow', entity='patient').
 *
 * Diffs are categorized (see shadow-diff.ts):
 *   - `expected`: tolerated drift (e.g. timestamp-only fields) — NOT logged as a
 *                 conflict; these never gate the cutover.
 *   - `real`:     a genuine value divergence on a tracked field — logged.
 *
 * The compare path swallows any failure (Mongo hiccup, PG write error): a shadow
 * failure must never affect the served request.
 *
 * Review hardening (item 3): the raw Mongo `.lean()` doc is passed through
 * `normalizeForComparison` first (ObjectId→hex, Date→ISO-8601, strip Mongoose
 * internals, sort keys) before projecting to the canonical mapping shape via
 * `normalize`. This ensures no spurious diffs from type representation.
 */
import { PatientModel as Patient } from '../../models/patient.js';
import { db } from '../../db/pg/client.js';
import { syncConflicts } from '../../db/pg/schema/sync.js';
import { logger } from '../../logger.js';
import { normalize, normalizeForComparison, diff } from './shadow-diff.js';
import type { PatientMapping } from './types.js';

export { normalize, normalizeForComparison, diff } from './shadow-diff.js';
export type { FieldDiff, DiffCategory } from './shadow-diff.js';

const log = logger.child({ module: 'patients-shadow' });

// In-process counters surfaced via the sync metrics endpoint.
export const shadowCounters = {
  patients_shadow_compared: 0,
  patients_shadow_diff_real: 0,
  patients_shadow_diff_expected: 0,
  patients_shadow_error: 0,
};

export type PatientQuery = { locationId: string; patientId: number };

/**
 * Run the Mongo side of the query and return the normalized mapping.
 * Applies normalizeForComparison on the raw .lean() doc first to coerce
 * ObjectId/Date types and strip Mongoose internals (review hardening item 3).
 */
async function readMongo(query: PatientQuery): Promise<Record<string, unknown> | null> {
  const doc = await Patient.findOne({
    locationId: query.locationId,
    patientId: query.patientId,
  }).lean<PatientMapping & Record<string, unknown>>();
  if (!doc) return null;
  // Deep-normalize raw Mongoose doc before projecting to tracked fields.
  const deepNorm = normalizeForComparison(doc) as (PatientMapping & Record<string, unknown>);
  return normalize(deepNorm);
}

/**
 * Compare a PG result against Mongo for the same query. On a real diff, inserts a
 * single `sync_conflicts` row. Never throws — failures are swallowed + counted.
 */
export async function compare(
  query: PatientQuery,
  pgResult: (PatientMapping & Record<string, unknown>) | null,
): Promise<void> {
  try {
    shadowCounters.patients_shadow_compared++;
    const mongoNorm = await readMongo(query);
    const pgNorm = normalize(pgResult);
    const diffs = diff(mongoNorm, pgNorm);

    if (diffs.length === 0) return;

    const realDiffs = diffs.filter((d) => d.category === 'real');
    const expectedDiffs = diffs.filter((d) => d.category === 'expected');
    shadowCounters.patients_shadow_diff_expected += expectedDiffs.length;

    if (realDiffs.length === 0) return; // only tolerated drift => no conflict row

    shadowCounters.patients_shadow_diff_real += realDiffs.length;

    await db.insert(syncConflicts).values({
      source: 'shadow',
      entity: 'patient',
      mongoValue: mongoNorm,
      pgValue: pgNorm,
      diffJson: {
        query,
        diffs: realDiffs,
        expected: expectedDiffs,
      },
    });

    log.warn({ query, realDiffs }, 'patient shadow-read real diff logged');
  } catch (err) {
    shadowCounters.patients_shadow_error++;
    log.error({ err, query }, 'patient shadow-read compare failed (request unaffected)');
  }
}
