import { eq } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { locations } from '../../db/pg/schema/config.js';
import { edgeLocationConfig, edgeCalendarMap } from '../../db/pg/schema/edge.js';
import { cryptoService } from '../../utils/crypto.js';
import type {
  EdgeConfigRepo,
  EdgeConfigView,
  EdgeCredInput,
  EdgeMappingInput,
  EdgeMappingRow,
} from './types.js';

function toView(row: typeof edgeLocationConfig.$inferSelect): EdgeConfigView {
  return {
    businessId: row.edgeBusinessId,
    // Mask-on-read: never decrypt into a response. Only expose presence.
    hasToken: row.edgeTokenCiphertext != null,
    signedOff: row.edgeSignedOff,
    enabled: row.edgeEnabled,
  };
}

function toMappingRow(row: typeof edgeCalendarMap.$inferSelect): EdgeMappingRow {
  return {
    ehrDoctorId: row.ehrDoctorId,
    ehrCalendarId: row.ehrCalendarId,
    edgeBusinessId: row.edgeBusinessId,
    edgeCalendarId: row.edgeCalendarId,
  };
}

async function resolveLocationId(location: string): Promise<number | null> {
  const [loc] = await db.select().from(locations).where(eq(locations.location, location));
  return loc ? loc.id : null;
}

async function resolveOrCreateLocationId(location: string): Promise<number> {
  const existing = await resolveLocationId(location);
  if (existing != null) return existing;
  const [loc] = await db.insert(locations).values({ location }).onConflictDoUpdate({
    target: locations.location,
    set: { location },
  }).returning();
  return loc.id;
}

export const edgeConfigRepo: EdgeConfigRepo = {
  async getConfig(location) {
    const locationId = await resolveLocationId(location);
    if (locationId == null) return null;
    const [row] = await db
      .select()
      .from(edgeLocationConfig)
      .where(eq(edgeLocationConfig.locationId, locationId));
    if (!row) return null;
    return toView(row);
  },

  async upsertConfig(location, input) {
    const locationId = await resolveOrCreateLocationId(location);

    const values: Partial<typeof edgeLocationConfig.$inferInsert> = {
      locationId,
    };
    if (input.businessId !== undefined) values.edgeBusinessId = input.businessId;
    if (input.signedOff !== undefined) values.edgeSignedOff = input.signedOff;
    if (input.enabled !== undefined) values.edgeEnabled = input.enabled;
    // Encrypt-on-write: only touch the ciphertext column when a new token was submitted,
    // so re-saving other fields never clobbers a previously stored token.
    if (input.token) values.edgeTokenCiphertext = cryptoService.encrypt(input.token);
    values.updatedAt = new Date();

    const [row] = await db
      .insert(edgeLocationConfig)
      .values({
        locationId,
        edgeBusinessId: input.businessId ?? null,
        edgeSignedOff: input.signedOff ?? false,
        edgeEnabled: input.enabled ?? false,
        edgeTokenCiphertext: input.token ? cryptoService.encrypt(input.token) : null,
      })
      .onConflictDoUpdate({
        target: edgeLocationConfig.locationId,
        set: values,
      })
      .returning();

    return toView(row);
  },

  async listMappings(location) {
    const locationId = await resolveLocationId(location);
    if (locationId == null) return [];
    const rows = await db
      .select()
      .from(edgeCalendarMap)
      .where(eq(edgeCalendarMap.locationId, locationId));
    return rows.map(toMappingRow);
  },

  async upsertMappings(location, mappings: EdgeMappingInput[]) {
    const locationId = await resolveOrCreateLocationId(location);

    const result: EdgeMappingRow[] = [];
    for (const m of mappings) {
      const [row] = await db
        .insert(edgeCalendarMap)
        .values({
          locationId,
          ehrDoctorId: m.ehrDoctorId ?? null,
          ehrCalendarId: m.ehrCalendarId,
          edgeBusinessId: m.edgeBusinessId,
          edgeCalendarId: m.edgeCalendarId ?? null,
        })
        .onConflictDoUpdate({
          target: [edgeCalendarMap.locationId, edgeCalendarMap.ehrCalendarId],
          set: {
            ehrDoctorId: m.ehrDoctorId ?? null,
            edgeBusinessId: m.edgeBusinessId,
            edgeCalendarId: m.edgeCalendarId ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      result.push(toMappingRow(row));
    }
    return result;
  },
};

