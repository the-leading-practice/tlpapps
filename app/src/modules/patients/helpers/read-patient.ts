/**
 * Patient read helper (P05 T02 / T03).
 *
 * Single choke point for patient-mapping reads. The source is chosen by
 * `config.patientsReadPrimary` (env `PATIENTS_READ_PRIMARY` ∈ {mongo, pg},
 * default `mongo` => behavior-neutral). Mongo stays the primary store; flipping to
 * `pg` is a human-gated cutover step (T04).
 *
 * When primary is `pg`, the helper additionally fires `shadow.compare` via
 * `setImmediate` — NEVER awaited — so the shadow Mongo re-read + diff logging adds
 * ZERO latency to the served request.
 *
 * Returns the canonical `PatientMapping | null`, identical in shape regardless of
 * which store served it, so callers are agnostic to the source.
 */
import { PatientModel as Patient } from '../../../models/patient.js';
import { db } from '../../../db/pg/client.js';
import { patients } from '../../../db/pg/schema/patients.js';
import { config } from '../../../config.js';
import { logger } from '../../../logger.js';
import * as shadow from '../shadow.js';
import type { PatientMapping } from '../types.js';

const log = logger.child({ module: 'patients-read' });

export type ReadPatientQuery = { locationId: string; patientId: number };

/**
 * Read a single patient mapping from Mongo (the historical primary).
 */
async function readFromMongo(query: ReadPatientQuery): Promise<PatientMapping | null> {
  const doc = await Patient.findOne({
    locationId: query.locationId,
    patientId: query.patientId,
  });
  if (!doc) return null;
  return {
    locationId: doc.locationId,
    patientId: doc.patientId,
    contactId: doc.contactId,
  };
}

/**
 * Read a single patient mapping from Postgres.
 */
async function readFromPg(query: ReadPatientQuery): Promise<PatientMapping | null> {
  const { and, eq } = await import('drizzle-orm');
  const rows = await db
    .select({
      locationId: patients.locationId,
      patientId: patients.patientId,
      contactId: patients.contactId,
    })
    .from(patients)
    .where(and(eq(patients.locationId, query.locationId), eq(patients.patientId, query.patientId)))
    .limit(1);

  if (rows.length === 0) return null;
  return {
    locationId: rows[0].locationId,
    patientId: rows[0].patientId,
    contactId: rows[0].contactId ?? '',
  };
}

/**
 * Read a patient mapping, picking the source by `config.patientsReadPrimary`.
 * When serving from PG, the Mongo shadow-compare is scheduled asynchronously and
 * never awaited — the returned promise resolves on the PG read alone.
 */
export async function readPatient(query: ReadPatientQuery): Promise<PatientMapping | null> {
  if (config.patientsReadPrimary === 'pg') {
    const pgResult = await readFromPg(query);
    // Fire-and-forget shadow compare. setImmediate keeps it off the request path;
    // compare() itself never throws, but guard the scheduling too.
    setImmediate(() => {
      shadow.compare(query, pgResult).catch((err) => {
        log.error({ err, query }, 'shadow compare scheduling error (request unaffected)');
      });
    });
    return pgResult;
  }
  return readFromMongo(query);
}
