import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * P03 config migration target — Mongo `clientAppConfigs` collection
 * (models appConfig.ts / clientConfig.ts, schema-identical) decomposed into:
 *   locations              — one row per Mongo config doc (keyed by `location`)
 *   config                 — the nested `config.*` scalar fields
 *   location_config_tables — the embedded `config.Tables[]` array (ChiroTouch SQL polling)
 *
 * `mongo_id` mirrors the Mongo `_id` (hex string) for idempotent backfill upsert.
 * Mongo schema marks every nested scalar `required`, but live docs may pre-date a field;
 * columns are nullable here so backfill never rejects a real row (diff tool surfaces gaps).
 */

export const locations = pgTable(
  'locations',
  {
    id: serial('id').primaryKey(),
    mongoId: text('mongo_id').unique(),
    location: text('location').notNull(),
    // Denormalized from config.Software — read on every webhook route decision.
    software: text('software'),
  },
  (t) => ({
    locationUnique: uniqueIndex('locations_location_unique').on(t.location),
  }),
);

export const config = pgTable(
  'config',
  {
    id: serial('id').primaryKey(),
    mongoId: text('mongo_id').unique(),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    lastRun: text('last_run'),
    dbProvider: text('db_provider'),
    useCacheTable: boolean('use_cache_table'),
    tokenRefreshMilliseconds: integer('token_refresh_milliseconds'),
    authEndpoint: text('auth_endpoint'),
    notificationEndpoint: text('notification_endpoint'),
    patientEndpoint: text('patient_endpoint'),
    appointmentEndpoint: text('appointment_endpoint'),
    connectionString: text('connection_string'),
    repeatMilliseconds: integer('repeat_milliseconds'),
    maxBatchSize: integer('max_batch_size'),
    software: text('software'),
  },
  (t) => ({
    // One config row per location; unique index also serves as the FK lookup index.
    locationUnique: uniqueIndex('config_location_id_unique').on(t.locationId),
  }),
);

export const locationConfigTables = pgTable(
  'location_config_tables',
  {
    id: serial('id').primaryKey(),
    configId: integer('config_id')
      .notNull()
      .references(() => config.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    uniqueField: text('unique_field').notNull(),
    formattedQuery: text('formatted_query'),
    sqlQuery: text('sql_query').notNull(),
    endpoint: text('endpoint'),
  },
  (t) => ({
    configIdx: index('location_config_tables_config_id_idx').on(t.configId),
  }),
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;
export type LocationConfigTable = typeof locationConfigTables.$inferSelect;
export type NewLocationConfigTable = typeof locationConfigTables.$inferInsert;
