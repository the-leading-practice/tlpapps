/**
 * Patient dual-write helper (P04).
 *
 * Every patient mutation goes through `writePatient`. It writes Mongo FIRST
 * (still the primary store; reads flip in P05), then — when
 * `config.pgDualWritePatients` is on — mirrors the row into Postgres as a
 * shadow. A PG failure is logged structured + increments a counter but NEVER
 * throws: the request still succeeds on the strength of the Mongo write.
 *
 * When the flag is off the helper is a thin pass-through to the Mongo upsert,
 * so merging P04 changes no runtime behavior.
 */
import { PatientModel as Patient } from '../../../models/patient.js';
import { db } from '../../../db/pg/client.js';
import { patients, patientExternalIds } from '../../../db/pg/schema/patients.js';
import { config } from '../../../config.js';
import { logger } from '../../../logger.js';
import type { PatientMapping } from '../types.js';

export type WritePatientOp = 'upsert';

export type WritePatientArgs = {
  op: WritePatientOp;
  locationId: string;
  mapping: PatientMapping & Record<string, unknown>;
};

// In-process counters surfaced via P10 /api/sync/metrics.
export const dualWriteCounters = {
  patients_dual_write_pg_fail: 0,
  patients_dual_write_pg_ok: 0,
};

/**
 * Mirror a single patient mapping into Postgres. Upserts the `patients` row on
 * the natural key (location_id, patient_id), then upserts the GHL contact id
 * into `patient_external_ids` (idempotent on (system, external_id)).
 * Throws on failure — the caller decides whether to swallow.
 */
async function mirrorToPg(args: WritePatientArgs, mongoId: string | null): Promise<void> {
  const { locationId, mapping } = args;
  const contactId = typeof mapping.contactId === 'string' ? mapping.contactId : null;

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(patients)
      .values({
        mongoId,
        locationId,
        patientId: mapping.patientId,
        contactId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [patients.locationId, patients.patientId],
        set: { contactId, mongoId, updatedAt: new Date() },
      })
      .returning({ id: patients.id });

    if (contactId && contactId.length > 0) {
      await tx
        .insert(patientExternalIds)
        .values({ patientId: row.id, system: 'ghl', externalId: contactId })
        .onConflictDoUpdate({
          target: [patientExternalIds.system, patientExternalIds.externalId],
          set: { patientId: row.id },
        });
    }
  });
}

/**
 * Write a patient mapping. Mongo is authoritative; PG is best-effort shadow.
 * Returns the Mongo document (existing upsert contract preserved).
 */
export async function writePatient(args: WritePatientArgs) {
  const { locationId, mapping } = args;
  const start = Date.now();

  // 1) Mongo write (primary) — preserves the prior upsert behavior exactly.
  const query = { locationId, patientId: mapping.patientId };
  const mongoDoc = await Patient.findOneAndUpdate(query, { ...mapping }, { upsert: true, new: true });
  const mongoOk = true;
  let pgOk = false;

  // 2) PG shadow write (best-effort, flag-gated).
  if (config.pgDualWritePatients) {
    const mongoId = mongoDoc?._id ? String(mongoDoc._id) : null;
    try {
      await mirrorToPg(args, mongoId);
      pgOk = true;
      dualWriteCounters.patients_dual_write_pg_ok++;
    } catch (err) {
      dualWriteCounters.patients_dual_write_pg_fail++;
      logger.error(
        {
          module: 'patients',
          op: args.op,
          locationId,
          patientId: mapping.patientId,
          mongo_ok: mongoOk,
          pg_ok: false,
          err,
        },
        'patient dual-write PG mirror failed (request unaffected)',
      );
    }
  }

  logger.debug(
    {
      module: 'patients',
      op: args.op,
      locationId,
      patientId: mapping.patientId,
      mongo_ok: mongoOk,
      pg_ok: pgOk,
      latency_ms: Date.now() - start,
    },
    'patient dual-write',
  );

  return mongoDoc;
}
