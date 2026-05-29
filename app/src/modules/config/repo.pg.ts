import { eq } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { locations, config as configTable, locationConfigTables } from '../../db/pg/schema/config.js';
import type { ConfigBody, ConfigDoc, ConfigRepo, ConfigTable } from './types.js';

/** Reassemble the nested Mongo-shaped doc from the three PG rows. */
function assemble(
  loc: typeof locations.$inferSelect,
  cfg: typeof configTable.$inferSelect | undefined,
  tables: (typeof locationConfigTables.$inferSelect)[],
): ConfigDoc {
  const body: ConfigBody = {};
  if (cfg) {
    if (cfg.lastRun != null) body.LastRun = cfg.lastRun;
    if (cfg.dbProvider != null) body.DBProvider = cfg.dbProvider;
    if (cfg.useCacheTable != null) body.UseCacheTable = cfg.useCacheTable;
    if (cfg.tokenRefreshMilliseconds != null)
      body.TokenRefreshMilliseconds = cfg.tokenRefreshMilliseconds;
    if (cfg.authEndpoint != null) body.AuthEndpoint = cfg.authEndpoint;
    if (cfg.notificationEndpoint != null) body.NotificationEndpoint = cfg.notificationEndpoint;
    if (cfg.patientEndpoint != null) body.PatientEndpoint = cfg.patientEndpoint;
    if (cfg.appointmentEndpoint != null) body.AppointmentEndpoint = cfg.appointmentEndpoint;
    if (cfg.connectionString != null) body.ConnectionString = cfg.connectionString;
    if (cfg.repeatMilliseconds != null) body.RepeatMilliseconds = cfg.repeatMilliseconds;
    if (cfg.maxBatchSize != null) body.MaxBatchSize = cfg.maxBatchSize;
    if (cfg.software != null) body.Software = cfg.software;
  }
  if (tables.length > 0) {
    body.Tables = tables.map((t) => {
      const row: ConfigTable = { Name: t.name, UniqueField: t.uniqueField, SqlQuery: t.sqlQuery };
      if (t.formattedQuery != null) row.formattedQuery = t.formattedQuery;
      if (t.endpoint != null) row.Endpoint = t.endpoint;
      return row;
    });
  }
  return { location: loc.location, config: body };
}

async function loadOne(loc: typeof locations.$inferSelect): Promise<ConfigDoc> {
  const [cfg] = await db.select().from(configTable).where(eq(configTable.locationId, loc.id));
  const tables = cfg
    ? await db
        .select()
        .from(locationConfigTables)
        .where(eq(locationConfigTables.configId, cfg.id))
    : [];
  return assemble(loc, cfg, tables);
}

export const pgConfigRepo: ConfigRepo = {
  async getAllConfigs() {
    const locs = await db.select().from(locations);
    return Promise.all(locs.map((l) => loadOne(l)));
  },

  async getConfig(location) {
    const [loc] = await db.select().from(locations).where(eq(locations.location, location));
    if (!loc) return null;
    return loadOne(loc);
  },

  async updateConfig(location, newConfig) {
    const body: ConfigBody = newConfig.config ?? {};
    const mongoId = typeof newConfig._id === 'string' ? newConfig._id : null;

    return db.transaction(async (tx) => {
      // Upsert the location row keyed on its unique `location`.
      const [loc] = await tx
        .insert(locations)
        .values({ location, software: body.Software ?? null, mongoId })
        .onConflictDoUpdate({
          target: locations.location,
          set: { software: body.Software ?? null },
        })
        .returning();

      const cfgValues = {
        locationId: loc.id,
        lastRun: body.LastRun ?? null,
        dbProvider: body.DBProvider ?? null,
        useCacheTable: body.UseCacheTable ?? null,
        tokenRefreshMilliseconds: body.TokenRefreshMilliseconds ?? null,
        authEndpoint: body.AuthEndpoint ?? null,
        notificationEndpoint: body.NotificationEndpoint ?? null,
        patientEndpoint: body.PatientEndpoint ?? null,
        appointmentEndpoint: body.AppointmentEndpoint ?? null,
        connectionString: body.ConnectionString ?? null,
        repeatMilliseconds: body.RepeatMilliseconds ?? null,
        maxBatchSize: body.MaxBatchSize ?? null,
        software: body.Software ?? null,
      };

      const [cfg] = await tx
        .insert(configTable)
        .values(cfgValues)
        .onConflictDoUpdate({ target: configTable.locationId, set: cfgValues })
        .returning();

      // Replace the embedded Tables[] wholesale (matches Mongo doc-overwrite semantics).
      await tx.delete(locationConfigTables).where(eq(locationConfigTables.configId, cfg.id));
      if (body.Tables && body.Tables.length > 0) {
        await tx.insert(locationConfigTables).values(
          body.Tables.map((t) => ({
            configId: cfg.id,
            name: t.Name,
            uniqueField: t.UniqueField,
            formattedQuery: t.formattedQuery ?? null,
            sqlQuery: t.SqlQuery,
            endpoint: t.Endpoint ?? null,
          })),
        );
      }

      const tables = await tx
        .select()
        .from(locationConfigTables)
        .where(eq(locationConfigTables.configId, cfg.id));
      return assemble(loc, cfg, tables);
    });
  },
};
