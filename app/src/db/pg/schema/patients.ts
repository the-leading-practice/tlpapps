import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * P04 patients migration target — Mongo `patients` collection (model patient.ts:
 * { locationId: string, patientId: number, contactId: string }) decomposed into:
 *   patients              — one row per Mongo patient-mapping doc
 *   patient_external_ids  — the per-system external identifier rows. The GHL
 *                           `contactId` becomes one row (system='ghl'); DrChrono /
 *                           Embodi / SilkOne ids land here too once those flows
 *                           write through the helper.
 *
 * `mongo_id` mirrors the Mongo `_id` (hex string) for idempotent backfill upsert.
 * NOTE (R-AUD-09): the live Mongo read `getPatients` queries `LocationId` (capital
 * L) — a typo against the model's `locationId`. PG uses the CORRECT lowercase
 * `location_id`; the Mongo-side read bug is out of scope (reads flip in P05).
 */

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mongoId: text('mongo_id').unique(),
    locationId: text('location_id').notNull(),
    patientId: integer('patient_id').notNull(),
    contactId: text('contact_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Mirrors the Mongo upsert key { locationId, patientId } — one mapping per pair.
    locationPatientUnique: uniqueIndex('patients_location_patient_unique').on(
      t.locationId,
      t.patientId,
    ),
    mongoIdIdx: index('patients_mongo_id_idx').on(t.mongoId),
  }),
);

export const patientExternalIds = pgTable(
  'patient_external_ids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    system: text('system').notNull(),
    externalId: text('external_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotency: one external id per system globally (lets backfill/dual-write upsert).
    systemExternalUnique: uniqueIndex('patient_external_ids_system_external_unique').on(
      t.system,
      t.externalId,
    ),
    patientSystemIdx: index('patient_external_ids_patient_system_idx').on(t.patientId, t.system),
    systemCheck: check(
      'patient_external_ids_system_check',
      sql`${t.system} in ('ghl', 'drchrono', 'embodi', 'silkone')`,
    ),
  }),
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
export type PatientExternalId = typeof patientExternalIds.$inferSelect;
export type NewPatientExternalId = typeof patientExternalIds.$inferInsert;
