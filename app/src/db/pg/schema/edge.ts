import { pgTable, serial, uuid, integer, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { locations } from './config.js';

/**
 * EDGE-01 — Titanium Edge credentials + calendar mapping. Self-contained sibling
 * schema (not new columns on `config`) so the Edge concern stays extraction-ready
 * (EMOD-04 spirit, D-01). No Edge network calls anywhere near this file.
 *
 * edge_location_config — one row per location. `edge_token_ciphertext` holds the
 * cryptoService (AES-256-GCM) hex output of the `olx_` gateway token; plaintext is
 * never persisted. `edge_signed_off` (default false) + `demo_business_id_override`
 * are the write-guardrail data this phase STORES only — enforcement lands EDGE-06/09.
 *
 * edge_calendar_map — per-location EHR doctor/calendar -> Edge business/calendar
 * mapping, mirroring the appointment_links / calendar-mapping shape in sync.ts
 * (mirrored, not extended, per D-04).
 */

export const edgeLocationConfig = pgTable(
  'edge_location_config',
  {
    id: serial('id').primaryKey(),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    edgeBusinessId: text('edge_business_id'),
    edgeTokenCiphertext: text('edge_token_ciphertext'),
    edgeSignedOff: boolean('edge_signed_off').notNull().default(false),
    edgeEnabled: boolean('edge_enabled').notNull().default(false),
    demoBusinessIdOverride: text('demo_business_id_override'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    locationUnique: uniqueIndex('edge_location_config_location_id_unique').on(t.locationId),
  }),
);

export const edgeCalendarMap = pgTable(
  'edge_calendar_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    ehrDoctorId: text('ehr_doctor_id'),
    ehrCalendarId: text('ehr_calendar_id'),
    edgeBusinessId: text('edge_business_id').notNull(),
    edgeCalendarId: text('edge_calendar_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    calendarUnique: uniqueIndex('edge_calendar_map_location_calendar_unique').on(
      t.locationId,
      t.ehrCalendarId,
    ),
  }),
);

export type EdgeLocationConfig = typeof edgeLocationConfig.$inferSelect;
export type NewEdgeLocationConfig = typeof edgeLocationConfig.$inferInsert;
export type EdgeCalendarMap = typeof edgeCalendarMap.$inferSelect;
export type NewEdgeCalendarMap = typeof edgeCalendarMap.$inferInsert;
