import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { patients } from './patients.js';
import { locations } from './config.js';

/**
 * P07 sync core schema — PG greenfield (no Mongo equivalent). These tables hold
 * the durable state for the event-driven DrChrono <-> GHL sync engine built in
 * P08 (DrChrono team). This phase ships SCHEMA ONLY; nothing here is wired into
 * boot or any route — it is behavior-neutral.
 *
 * Six tables:
 *   sync_jobs        — one row per cron/manual job run (status + summary).
 *   sync_events      — webhook + cron-derived events persisted BEFORE processing.
 *                      `dedup_key` is the idempotency key (unique), composed by
 *                      the engine as `${source}:${action}:${external_id}:${ver}`.
 *   sync_mappings    — identity bridge between DrChrono and GHL ids per location.
 *   sync_conflicts   — divergences surfaced by shadow/sync/reconcile passes.
 *   appointment_links— GHL calendar event <-> DrChrono appointment pairing.
 *   sync_dead_letter — events that exhausted retries (FK back to sync_events).
 *
 * FKs: appointment_links.patient_id -> patients.id (P04); sync_dead_letter.event_id
 * -> sync_events.id. location_id columns reference locations.id (P03) where the
 * row is location-scoped.
 */

// --- Enums -----------------------------------------------------------------

export const syncSourceEnum = pgEnum('sync_source', ['ghl', 'drchrono']);
export const syncJobStatusEnum = pgEnum('sync_job_status', [
  'running',
  'succeeded',
  'failed',
]);
export const syncEventStatusEnum = pgEnum('sync_event_status', [
  'pending',
  'processed',
  'failed',
  'dead',
]);
export const syncMappingKindEnum = pgEnum('sync_mapping_kind', [
  'patient',
  'appointment',
]);
export const syncConflictSourceEnum = pgEnum('sync_conflict_source', [
  'shadow',
  'sync',
  'reconcile',
]);
export const syncConflictResolutionEnum = pgEnum('sync_conflict_resolution', [
  'pending',
  'auto-resolved',
  'manual-resolved',
]);

// --- Tables ----------------------------------------------------------------

export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    status: syncJobStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    summary: jsonb('summary'),
    locationId: integer('location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    kindStatusStartedIdx: index('sync_jobs_kind_status_started_idx').on(
      t.kind,
      t.status,
      t.startedAt.desc(),
    ),
  }),
);

export const syncEvents = pgTable(
  'sync_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: syncSourceEnum('source').notNull(),
    action: text('action').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    status: syncEventStatusEnum('status').notNull().default('pending'),
    error: text('error'),
    originTag: text('origin_tag'),
    // Idempotency key. Engine composes `${source}:${action}:${external_id}:${ver}`.
    dedupKey: text('dedup_key').notNull(),
  },
  (t) => ({
    dedupKeyUnique: uniqueIndex('sync_events_dedup_key_unique').on(t.dedupKey),
    statusReceivedIdx: index('sync_events_status_received_idx').on(t.status, t.receivedAt),
  }),
);

export const syncMappings = pgTable(
  'sync_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: syncMappingKindEnum('kind').notNull(),
    drchronoId: text('drchrono_id').notNull(),
    ghlId: text('ghl_id').notNull(),
    locationId: integer('location_id').references(() => locations.id, {
      onDelete: 'cascade',
    }),
    origin: text('origin'),
    version: integer('version').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastHash: text('last_hash'),
  },
  (t) => ({
    drchronoUnique: uniqueIndex('sync_mappings_kind_drchrono_location_unique').on(
      t.kind,
      t.drchronoId,
      t.locationId,
    ),
    ghlUnique: uniqueIndex('sync_mappings_kind_ghl_location_unique').on(
      t.kind,
      t.ghlId,
      t.locationId,
    ),
  }),
);

export const syncConflicts = pgTable(
  'sync_conflicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: syncConflictSourceEnum('source').notNull(),
    entity: text('entity').notNull(),
    mongoValue: jsonb('mongo_value'),
    pgValue: jsonb('pg_value'),
    ghlValue: jsonb('ghl_value'),
    drchronoValue: jsonb('drchrono_value'),
    resolution: syncConflictResolutionEnum('resolution').notNull().default('pending'),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    diffJson: jsonb('diff_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    resolutionCreatedIdx: index('sync_conflicts_resolution_created_idx').on(
      t.resolution,
      t.createdAt,
    ),
  }),
);

export const appointmentLinks = pgTable(
  'appointment_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ghlEventId: text('ghl_event_id').notNull(),
    drchronoAppointmentId: text('drchrono_appointment_id').notNull(),
    locationId: integer('location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    doctorId: text('doctor_id'),
    patientId: uuid('patient_id').references(() => patients.id, {
      onDelete: 'set null',
    }),
    calendarId: text('calendar_id'),
    status: text('status'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (t) => ({
    ghlEventUnique: uniqueIndex('appointment_links_ghl_event_id_unique').on(t.ghlEventId),
    drchronoAppointmentUnique: uniqueIndex(
      'appointment_links_drchrono_appointment_id_unique',
    ).on(t.drchronoAppointmentId),
  }),
);

export const syncDeadLetter = pgTable('sync_dead_letter', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => syncEvents.id, { onDelete: 'cascade' }),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  replayedAt: timestamp('replayed_at', { withTimezone: true }),
});

/**
 * P05 verify mode — capture of outbound writes the engine WOULD have sent in
 * `verify` write mode. Each row is a full envelope (url/method/headers/body the
 * writer built) POSTed to the built-in /api/sync/verify-sink endpoint. No EHR is
 * ever touched; this is the human-inspectable proof of correct create/update/
 * cancel/delete emission.
 */
export const syncVerifyCaptures = pgTable('sync_verify_captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  direction: text('direction'),
  eventId: text('event_id'),
  wouldHaveSent: jsonb('would_have_sent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- P14 sync_controls — per-(direction × entity) runtime toggles ---------------

export const syncDirectionEnum = pgEnum('sync_direction', ['drchrono_to_ghl', 'ghl_to_drchrono', 'drchrono_to_edge']);
export const syncEntityEnum = pgEnum('sync_entity', ['patients', 'appointments']);
export const syncControlModeEnum = pgEnum('sync_control_mode', ['off', 'dry', 'on']);

import { primaryKey } from 'drizzle-orm/pg-core';

export const syncControls = pgTable(
  'sync_controls',
  {
    direction: syncDirectionEnum('direction').notNull(),
    entity: syncEntityEnum('entity').notNull(),
    mode: syncControlModeEnum('mode').notNull().default('off'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.direction, t.entity] }),
  }),
);

export type SyncControl = typeof syncControls.$inferSelect;
export type NewSyncControl = typeof syncControls.$inferInsert;

// --- availability_blocks — DrChrono break → GHL block-slot idempotency map ------
//
// One row per DrChrono break record that has been mirrored into GHL as a
// blocked-time slot (DrChrono→GHL availability sync). Keyed by (ghl_location_id,
// drchrono_break_id) so each run can dedup (skip breaks already blocked) and
// reap stale blocks (a break that vanished → delete its GHL block-slot). PG
// greenfield; no Mongo equivalent. Behavior-neutral until SYNC_WRITE_AVAILABILITY
// is turned on for an allowlisted location.

export const availabilityBlocks = pgTable(
  'availability_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** GHL location id (allowlist namespace) the block-slot lives in. */
    ghlLocationId: text('ghl_location_id').notNull(),
    /** DrChrono break appointment id (source of truth). */
    drchronoBreakId: text('drchrono_break_id').notNull(),
    /** GHL block-slot event id returned by the block-slots create call. */
    ghlBlockId: text('ghl_block_id').notNull(),
    /** DrChrono provider (doctor) id the break belongs to. */
    providerId: text('provider_id'),
    /** GHL user the block-slot was assigned to (from providerAvailabilityMap). */
    ghlUserId: text('ghl_user_id'),
    startTime: text('start_time'),
    endTime: text('end_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    breakUnique: uniqueIndex('availability_blocks_location_break_unique').on(
      t.ghlLocationId,
      t.drchronoBreakId,
    ),
    locationIdx: index('availability_blocks_location_idx').on(t.ghlLocationId),
  }),
);

export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
export type NewAvailabilityBlock = typeof availabilityBlocks.$inferInsert;

// --- Inferred types (the row/insert contracts the P08 engine builds against) ---

export type SyncJob = typeof syncJobs.$inferSelect;
export type NewSyncJob = typeof syncJobs.$inferInsert;
export type SyncEvent = typeof syncEvents.$inferSelect;
export type NewSyncEvent = typeof syncEvents.$inferInsert;
export type SyncMapping = typeof syncMappings.$inferSelect;
export type NewSyncMapping = typeof syncMappings.$inferInsert;
export type SyncConflict = typeof syncConflicts.$inferSelect;
export type NewSyncConflict = typeof syncConflicts.$inferInsert;
export type AppointmentLink = typeof appointmentLinks.$inferSelect;
export type NewAppointmentLink = typeof appointmentLinks.$inferInsert;
export type SyncDeadLetter = typeof syncDeadLetter.$inferSelect;
export type NewSyncDeadLetter = typeof syncDeadLetter.$inferInsert;
export type SyncVerifyCapture = typeof syncVerifyCaptures.$inferSelect;
export type NewSyncVerifyCapture = typeof syncVerifyCaptures.$inferInsert;
