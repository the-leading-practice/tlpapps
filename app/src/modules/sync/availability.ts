/**
 * DrChrono → GHL availability (blocked-time) sync.
 *
 * PROBLEM: GHL online booking (incl. Conversation AI) offers slots during times a
 * provider is actually unavailable in DrChrono (e.g. vacation / lunch breaks).
 * DrChrono is the scheduling source of truth but its blocked/break time never
 * reaches GHL, so GHL shows the provider bookable. This module mirrors DrChrono
 * `appt_is_break` records into GHL as block-slots so those times disappear from
 * GHL availability, and reaps blocks whose source break has vanished.
 *
 * SAFETY (fail-closed, ships OFF):
 *   - Kill switch `SYNC_WRITE_AVAILABILITY` (off/dry/verify/on), default **off**.
 *     off → no-op; dry/verify → log intent, no write; on → write.
 *   - Allowlist guard (isLocationAllowed) — fail-closed if ghlLocationId absent or
 *     not allowlisted; forbidden real-practice IDs are hard-blocked.
 *   - providerAvailabilityMap gating — a break for an unmapped provider is a no-op;
 *     an empty/absent map makes the whole location a no-op.
 *
 * All external deps are injectable so the engine is unit-testable without a live
 * Mongo / GHL / Postgres — mirrors createPatientServiceClient's deps pattern.
 */

import { logger } from '../../logger.js';
import type { WriteMode } from './writers/dispatch.js';
import { isLocationAllowed } from './writers/allowlist.js';
import { integrationService, appointmentGHLService } from '../integration/services.js';
import { formatTime } from '../integration/utils.js';
import { mintTokenForLocation } from '../identity/controller.js';
import {
  drChronoConfigService,
  drChronoAuth,
  drChronoAPIClient,
} from '../drchrono/services.js';
import type { DrChronoAppointment, DrChronoConfigLocation } from '../drchrono/types.js';

const log = logger.child({ module: 'availability-sync' });

// ---------------------------------------------------------------------------
// Kill switch — env-only, fail-closed
// ---------------------------------------------------------------------------

/**
 * Resolve the availability write mode from `SYNC_WRITE_AVAILABILITY`. Unknown /
 * absent → 'off' (fail-closed). This is a dedicated knob (independent of the
 * patients/appointments sync_controls rows) but resolved the same fail-closed way:
 * anything that is not an explicit valid mode collapses to 'off'.
 */
export function resolveAvailabilityMode(env: NodeJS.ProcessEnv = process.env): WriteMode {
  const raw = env.SYNC_WRITE_AVAILABILITY;
  if (raw === 'on') return 'on';
  if (raw === 'verify') return 'verify';
  if (raw === 'dry') return 'dry';
  return 'off';
}

// ---------------------------------------------------------------------------
// Idempotency store — DrChrono break → GHL block-slot mapping
// ---------------------------------------------------------------------------

export type AvailabilityRecord = {
  ghlLocationId: string;
  drchronoBreakId: string;
  ghlBlockId: string;
  providerId?: string;
  ghlUserId?: string;
  startTime?: string;
  endTime?: string;
};

export interface AvailabilityStore {
  listByLocation(ghlLocationId: string): Promise<AvailabilityRecord[]>;
  getByBreakId(ghlLocationId: string, drchronoBreakId: string): Promise<AvailabilityRecord | null>;
  upsert(rec: AvailabilityRecord): Promise<void>;
  remove(ghlLocationId: string, drchronoBreakId: string): Promise<void>;
}

/** Default Postgres-backed store (Drizzle). Lazily imports the client so unit
 *  tests that inject a fake store never touch the DB. */
export const drizzleAvailabilityStore: AvailabilityStore = {
  async listByLocation(ghlLocationId) {
    const { db } = await import('../../db/pg/client.js');
    const { availabilityBlocks } = await import('../../db/pg/schema/sync.js');
    const { eq } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(availabilityBlocks)
      .where(eq(availabilityBlocks.ghlLocationId, ghlLocationId));
    return rows.map(rowToRecord);
  },
  async getByBreakId(ghlLocationId, drchronoBreakId) {
    const { db } = await import('../../db/pg/client.js');
    const { availabilityBlocks } = await import('../../db/pg/schema/sync.js');
    const { and, eq } = await import('drizzle-orm');
    const [row] = await db
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.ghlLocationId, ghlLocationId),
          eq(availabilityBlocks.drchronoBreakId, drchronoBreakId),
        ),
      );
    return row ? rowToRecord(row) : null;
  },
  async upsert(rec) {
    const { db } = await import('../../db/pg/client.js');
    const { availabilityBlocks } = await import('../../db/pg/schema/sync.js');
    await db
      .insert(availabilityBlocks)
      .values({
        ghlLocationId: rec.ghlLocationId,
        drchronoBreakId: rec.drchronoBreakId,
        ghlBlockId: rec.ghlBlockId,
        providerId: rec.providerId,
        ghlUserId: rec.ghlUserId,
        startTime: rec.startTime,
        endTime: rec.endTime,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [availabilityBlocks.ghlLocationId, availabilityBlocks.drchronoBreakId],
        set: { ghlBlockId: rec.ghlBlockId, lastSeenAt: new Date() },
      });
  },
  async remove(ghlLocationId, drchronoBreakId) {
    const { db } = await import('../../db/pg/client.js');
    const { availabilityBlocks } = await import('../../db/pg/schema/sync.js');
    const { and, eq } = await import('drizzle-orm');
    await db
      .delete(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.ghlLocationId, ghlLocationId),
          eq(availabilityBlocks.drchronoBreakId, drchronoBreakId),
        ),
      );
  },
};

function rowToRecord(row: any): AvailabilityRecord {
  return {
    ghlLocationId: row.ghlLocationId,
    drchronoBreakId: row.drchronoBreakId,
    ghlBlockId: row.ghlBlockId,
    providerId: row.providerId ?? undefined,
    ghlUserId: row.ghlUserId ?? undefined,
    startTime: row.startTime ?? undefined,
    endTime: row.endTime ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Injectable deps
// ---------------------------------------------------------------------------

export type CreateBlockFn = (
  block: { locationId: string; startTime: string; endTime: string; assignedUserId: string; title?: string },
  jwt: string,
) => Promise<{ status: number; data: unknown }>;

export type DeleteBlockFn = (
  eventId: string,
  jwt: string,
) => Promise<{ status: number; data: unknown }>;

export type AvailabilityDeps = {
  /** Override the kill-switch resolver (tests). */
  getMode?: () => Promise<WriteMode> | WriteMode;
  /** Override the allowlist check (tests). */
  checkAllowlist?: (ghlLocationId: string) => boolean;
  /** Supply the DrChrono appointments for this location (tests / all-location driver). */
  getAppointments?: (location: DrChronoConfigLocation) => Promise<DrChronoAppointment[]>;
  /** Mint a GHL access token for a location (tests avoid live Mongo/token lookup). */
  mintToken?: typeof mintTokenForLocation;
  /** Create a GHL block-slot. Defaults to integrationService.createBlock. */
  createBlock?: CreateBlockFn;
  /** Delete a GHL block-slot. Defaults to appointmentGHLService.deleteCalendarBlock. */
  deleteBlock?: DeleteBlockFn;
  /** Persistence for break→block mapping. Defaults to the Drizzle store. */
  store?: AvailabilityStore;
  /** Injected clock (tests). */
  now?: () => number;
};

export type AvailabilityResult = {
  status: number;
  location: string;
  mode: WriteMode;
  skipped?: boolean;
  reason?: string;
  created: number;
  deleted: number;
  intended: number;
  skippedExisting: number;
  unmappedProviders: number;
};

// ---------------------------------------------------------------------------
// Core: single-location availability sync
// ---------------------------------------------------------------------------

/**
 * Mirror one DrChrono location's break/blocked time into GHL block-slots.
 *
 * Steps: gate (mode → allowlist → provider map) → fetch breaks → for each mapped
 * break create the block-slot (dedup on existing mapping) → reap stale blocks
 * whose source break no longer exists.
 */
export async function syncAvailabilityForLocation(
  location: DrChronoConfigLocation,
  deps: AvailabilityDeps = {},
): Promise<AvailabilityResult> {
  const getMode = deps.getMode ?? resolveAvailabilityMode;
  const checkAllowlist = deps.checkAllowlist ?? isLocationAllowed;
  const createBlock = deps.createBlock ?? integrationService.createBlock;
  const deleteBlock = deps.deleteBlock ?? appointmentGHLService.deleteCalendarBlock;
  const store = deps.store ?? drizzleAvailabilityStore;
  const mintToken = deps.mintToken ?? mintTokenForLocation;

  const base: AvailabilityResult = {
    status: 200,
    location: location.name,
    mode: 'off',
    created: 0,
    deleted: 0,
    intended: 0,
    skippedExisting: 0,
    unmappedProviders: 0,
  };

  const mode = (await getMode()) as WriteMode;
  base.mode = mode;

  // Gate 1 — kill switch. off → no-op.
  if (mode === 'off') {
    log.info({ location: location.name }, 'availability sync skipped — SYNC_WRITE_AVAILABILITY=off');
    return { ...base, skipped: true, reason: 'mode-off' };
  }

  // Gate 2 — allowlist. Fail-closed if ghlLocationId absent or not allowlisted.
  const ghlLocationId = location.ghlLocationId;
  if (!ghlLocationId) {
    log.error({ location: location.name }, 'availability blocked — ghlLocationId not set (fail-closed)');
    return { ...base, skipped: true, reason: 'allowlist-blocked' };
  }
  if (!checkAllowlist(ghlLocationId)) {
    log.error({ location: location.name, ghlLocationId }, 'availability blocked — location not allowlisted (fail-closed)');
    return { ...base, skipped: true, reason: 'allowlist-blocked' };
  }

  // Gate 3 — provider map. Empty/absent → whole-location no-op.
  const providerMap = location.providerAvailabilityMap ?? {};
  if (Object.keys(providerMap).length === 0) {
    log.info({ location: location.name }, 'availability no-op — providerAvailabilityMap empty/absent');
    return { ...base, skipped: true, reason: 'no-provider-map' };
  }

  // Fetch DrChrono appointments and keep only break/blocked-time records.
  const appts = deps.getAppointments
    ? await deps.getAppointments(location)
    : await defaultGetAppointments(location);
  const breaks = appts.filter((a) => a.appt_is_break === true);

  // Resolve which breaks map to a GHL user; skip unmapped providers (no-op).
  type Planned = { breakId: string; providerId: string; ghlUserId: string; startTime: string; endTime: string; title: string };
  const planned: Planned[] = [];
  for (const b of breaks) {
    const providerId = b.doctor != null ? String(b.doctor) : '';
    if (!providerId) {
      base.unmappedProviders++;
      continue;
    }
    const entry = providerMap[providerId];
    if (!entry || !entry.ghlUserId) {
      base.unmappedProviders++;
      continue;
    }
    if (!b.scheduled_time) continue;
    const durMin = typeof b.duration === 'number' && b.duration > 0 ? b.duration : 60;
    // DrChrono `scheduled_time` is naive practice-local (no offset). GHL reads a
    // naive string as UTC, so send it through formatTime — which appends the
    // location's tz offset and normalizes to a UTC ISO — exactly like the
    // appointment write path (patients/utils formatTime). Without this the block
    // lands shifted by the tz offset (-4h EDT / -5h EST) and fails to cover the
    // real break window.
    const startTime = formatTime(b.scheduled_time, location.timezone);
    if (!startTime) continue;
    const endTime = new Date(new Date(startTime).getTime() + durMin * 60_000).toISOString();
    const title = (b.reason && String(b.reason).trim()) || 'Blocked';
    planned.push({ breakId: String(b.id), providerId, ghlUserId: entry.ghlUserId, startTime, endTime, title });
  }
  base.intended = planned.length;

  // dry / verify — log intent, no writes (fail-closed like the other writers).
  if (mode === 'dry' || mode === 'verify') {
    log.info(
      { location: location.name, mode, intended: planned.length, unmapped: base.unmappedProviders },
      `availability ${mode}-run — would create block-slots (no live write)`,
    );
    return { ...base, skipped: true, reason: `mode-${mode}` };
  }

  // mode === 'on' — mint a GHL token for the create/delete calls.
  let jwt: string;
  try {
    const minted = await mintToken(ghlLocationId);
    jwt = minted.ghlAccessToken;
  } catch (e: any) {
    log.error({ ghlLocationId, err: e?.message }, 'availability: mintTokenForLocation failed');
    return { ...base, status: 401, skipped: true, reason: 'no_valid_jwt' };
  }

  const plannedBreakIds = new Set(planned.map((p) => p.breakId));

  // Create block-slots for breaks not already mapped (dedup on the store).
  for (const p of planned) {
    const existing = await store.getByBreakId(ghlLocationId, p.breakId);
    if (existing && existing.ghlBlockId) {
      base.skippedExisting++;
      // Touch lastSeenAt so it isn't reaped.
      await store.upsert({ ...existing, ghlLocationId, drchronoBreakId: p.breakId });
      continue;
    }
    const resp = await createBlock(
      { locationId: ghlLocationId, startTime: p.startTime, endTime: p.endTime, assignedUserId: p.ghlUserId, title: p.title },
      jwt,
    );
    if (resp.status >= 200 && resp.status < 300) {
      const ghlBlockId = (resp.data as any)?.id ?? '';
      if (ghlBlockId) {
        await store.upsert({
          ghlLocationId,
          drchronoBreakId: p.breakId,
          ghlBlockId,
          providerId: p.providerId,
          ghlUserId: p.ghlUserId,
          startTime: p.startTime,
          endTime: p.endTime,
        });
      }
      base.created++;
      log.info({ location: location.name, breakId: p.breakId, ghlBlockId }, 'availability block-slot created');
    } else {
      log.warn({ location: location.name, breakId: p.breakId, status: resp.status }, 'availability block-slot create failed');
    }
  }

  // Stale cleanup — any previously-synced block whose source break is gone → delete.
  const persisted = await store.listByLocation(ghlLocationId);
  for (const rec of persisted) {
    if (plannedBreakIds.has(rec.drchronoBreakId)) continue;
    const resp = await deleteBlock(rec.ghlBlockId, jwt);
    if ((resp.status >= 200 && resp.status < 300) || resp.status === 404) {
      await store.remove(ghlLocationId, rec.drchronoBreakId);
      base.deleted++;
      log.info({ location: location.name, breakId: rec.drchronoBreakId, ghlBlockId: rec.ghlBlockId }, 'availability stale block removed');
    } else {
      log.warn({ location: location.name, ghlBlockId: rec.ghlBlockId, status: resp.status }, 'availability stale block delete failed — will retry next run');
    }
  }

  return base;
}

/** Default DrChrono appointment fetch for a location (used by the all-location driver). */
async function defaultGetAppointments(location: DrChronoConfigLocation): Promise<DrChronoAppointment[]> {
  const cfg = await drChronoConfigService.getConfig();
  if (!cfg) return [];
  const tokenResp = await drChronoAuth.getValidToken(
    location.name,
    cfg.clientId,
    cfg.clientSecret,
    location.accessToken,
    location.refreshToken,
    location.tokenExpiry,
  );
  if (tokenResp.status !== 200 || !tokenResp.accessToken) {
    log.error({ location: location.name }, 'availability: DrChrono token refresh failed');
    return [];
  }
  const { startDate, endDate } = pollWindow(cfg.config.LookAheadDays);
  const client = drChronoAPIClient(tokenResp.accessToken);
  const resp = await client.getAppointments(startDate, endDate);
  if (resp.status < 200 || resp.status >= 300) {
    log.error({ location: location.name, err: resp.data }, 'availability: getAppointments failed');
    return [];
  }
  return resp.data as DrChronoAppointment[];
}

/** Compute the same look-ahead window runFullPoll uses (yesterday → +LookAheadDays). */
function pollWindow(lookAheadDays: number): { startDate: string; endDate: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const future = new Date(now);
  future.setDate(future.getDate() + lookAheadDays);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { startDate: fmt(yesterday), endDate: fmt(future) };
}

// ---------------------------------------------------------------------------
// All-locations driver (mirrors runFullPoll)
// ---------------------------------------------------------------------------

/**
 * Run availability sync across every configured DrChrono location. On-demand
 * (POST /api/sync/availability) or from the poll cron. No-op end to end unless
 * SYNC_WRITE_AVAILABILITY is on AND the location is allowlisted AND mapped.
 */
export async function runAvailabilitySync(deps: AvailabilityDeps = {}): Promise<AvailabilityResult[]> {
  const cfg = await drChronoConfigService.getConfig();
  if (!cfg) {
    log.warn('availability: no drchrono config found');
    return [];
  }
  const results: AvailabilityResult[] = [];
  for (const location of cfg.locations as DrChronoConfigLocation[]) {
    try {
      results.push(await syncAvailabilityForLocation(location, deps));
    } catch (err) {
      log.error({ err, location: (location as any)?.name }, 'availability: location run failed');
      results.push({
        status: 500,
        location: (location as any)?.name ?? 'unknown',
        mode: 'off',
        skipped: true,
        reason: 'error',
        created: 0,
        deleted: 0,
        intended: 0,
        skippedExisting: 0,
        unmappedProviders: 0,
      });
    }
  }
  return results;
}
