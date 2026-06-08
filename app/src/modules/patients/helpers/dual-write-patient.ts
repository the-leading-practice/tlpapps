/**
 * Patient dual-write helper (P04 + P06).
 *
 * Every patient mutation goes through `writePatient`. Behaviour depends on
 * `PATIENTS_PRIMARY` (re-read from env on every call — seamless Coolify flip):
 *
 * PATIENTS_PRIMARY=mongo  (default, P04 / P05 / pre-cutover)
 *   • Mongo write is required (awaited, throws on failure → request fails).
 *   • When `PG_DUAL_WRITE_PATIENTS=on`, PG mirror is best-effort post-Mongo.
 *     A PG failure is logged structured + increments a counter but NEVER throws.
 *   • This preserves the exact pre-P06 behaviour.
 *
 * PATIENTS_PRIMARY=pg  (P06 cutover)
 *   • PG write is required (awaited, throws on failure → request fails).
 *   • Mongo write is best-effort AFTER PG, gated by `PATIENTS_LEGACY_WRITE`
 *     (default on — warm standby for 14-day rollback window).
 *     A Mongo failure is logged structured but NEVER throws.
 *
 * Rollback: flip `PATIENTS_PRIMARY=mongo` in Coolify — no redeploy required.
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
  patients_dual_write_mongo_fail: 0,
  patients_dual_write_mongo_ok: 0,
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
 * Write routing logic extracted for unit-testability (P06 T03).
 *
 * Accepts injected writers so tests can verify routing without a real DB.
 * `writePatient` (below) calls this with the real implementations.
 */
export type WritePatientDeps = {
  pgWriter: (args: WritePatientArgs, mongoId: string | null) => Promise<void>;
  mongoWriter: (args: WritePatientArgs) => Promise<unknown>;
  log: { error: (data: Record<string, unknown>, msg: string) => void; debug: (data: Record<string, unknown>, msg: string) => void };
  counters: typeof dualWriteCounters;
};

export async function writePatientWithDeps(
  args: WritePatientArgs,
  primary: 'mongo' | 'pg',
  pgDualWriteEnabled: boolean,
  legacyWriteEnabled: boolean,
  deps: WritePatientDeps,
): Promise<unknown> {
  const { locationId, mapping } = args;
  const start = Date.now();

  if (primary === 'pg') {
    // ── PG-primary mode (P06 cutover) ─────────────────────────────────────────
    // 1) PG write is REQUIRED — throws on failure, request fails.
    await deps.pgWriter(args, null);
    deps.counters.patients_dual_write_pg_ok++;

    // 2) Mongo write is best-effort warm standby, gated by PATIENTS_LEGACY_WRITE.
    let mongoDoc = null;
    if (legacyWriteEnabled) {
      try {
        mongoDoc = await deps.mongoWriter(args);
        deps.counters.patients_dual_write_mongo_ok++;
      } catch (err) {
        deps.counters.patients_dual_write_mongo_fail++;
        deps.log.error(
          {
            module: 'patients',
            op: args.op,
            locationId,
            patientId: mapping.patientId,
            pg_ok: true,
            mongo_ok: false,
            err,
          },
          'patient write Mongo warm-standby failed (request unaffected — PG is primary)',
        );
      }
    }

    deps.log.debug(
      {
        module: 'patients',
        op: args.op,
        locationId,
        patientId: mapping.patientId,
        primary: 'pg',
        pg_ok: true,
        mongo_ok: mongoDoc !== null,
        latency_ms: Date.now() - start,
      },
      'patient write (pg-primary)',
    );

    return mongoDoc;
  } else {
    // ── Mongo-primary mode (default — P04/P05 / pre-cutover) ──────────────────
    // 1) Mongo write (primary) — preserves the prior upsert behaviour exactly.
    const mongoDoc = await deps.mongoWriter(args);
    const mongoOk = true;
    let pgOk = false;

    // 2) PG shadow write (best-effort, flag-gated).
    if (pgDualWriteEnabled) {
      const mongoId = (mongoDoc as { _id?: unknown })?._id ? String((mongoDoc as { _id: unknown })._id) : null;
      try {
        await deps.pgWriter(args, mongoId);
        pgOk = true;
        deps.counters.patients_dual_write_pg_ok++;
      } catch (err) {
        deps.counters.patients_dual_write_pg_fail++;
        deps.log.error(
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

    deps.log.debug(
      {
        module: 'patients',
        op: args.op,
        locationId,
        patientId: mapping.patientId,
        primary: 'mongo',
        mongo_ok: mongoOk,
        pg_ok: pgOk,
        latency_ms: Date.now() - start,
      },
      'patient dual-write',
    );

    return mongoDoc;
  }
}

/**
 * Write a patient mapping. Env resolved per-call so a Coolify flag flip is
 * seamless — no restart required (D-10).
 *
 * When PATIENTS_PRIMARY=pg (P06+): PG is authoritative (throws on failure);
 *   Mongo is best-effort warm-standby (gated by PATIENTS_LEGACY_WRITE).
 * When PATIENTS_PRIMARY=mongo (default): Mongo is authoritative (throws on
 *   failure); PG is best-effort shadow (gated by PG_DUAL_WRITE_PATIENTS).
 *
 * Returns the Mongo document (existing upsert contract preserved).
 */
export async function writePatient(args: WritePatientArgs) {
  const deps: WritePatientDeps = {
    pgWriter: mirrorToPg,
    mongoWriter: async (a) => {
      const query = { locationId: a.locationId, patientId: a.mapping.patientId };
      return Patient.findOneAndUpdate(query, { ...a.mapping }, { upsert: true, new: true });
    },
    log: logger as WritePatientDeps['log'],
    counters: dualWriteCounters,
  };

  return writePatientWithDeps(
    args,
    config.patientsPrimary,
    config.pgDualWritePatients,
    config.patientsLegacyWrite,
    deps,
  );
}
