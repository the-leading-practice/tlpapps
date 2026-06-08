/**
 * backfill-appointments.ts — P09 T05 historical appointment backfill.
 *
 * Paginated pull of the last N days (default 90) of appointments from BOTH DrChrono and
 * GHL, per location. For each appointment it computes the same deterministic `dedup_key`
 * the live webhook path uses (sync/ingest.ts) and inserts a `pending` row into
 * `sync_events` (`ON CONFLICT (dedup_key) DO NOTHING`). The P08 engine then reconciles
 * them through the normal dry/off/on machinery — backfill itself NEVER calls an EHR write
 * endpoint and NEVER flips a kill switch.
 *
 * SAFETY: `--dry-run` is the DEFAULT. Dry-run only fetches (read-only), computes keys,
 * and prints a summary — it inserts NOTHING. `--apply` is required to write sync_events.
 * Even with `--apply`, no GHL/DrChrono mutation occurs; we only enqueue events.
 *
 * Usage:
 *   tsx scripts/backfill-appointments.ts                       # dry-run, 90d, all locations
 *   tsx scripts/backfill-appointments.ts --days 30             # dry-run, 30d
 *   tsx scripts/backfill-appointments.ts --location <loc>      # filter one location
 *   tsx scripts/backfill-appointments.ts --apply               # actually enqueue events
 *
 * This file is code-only; the implementing agent does NOT run --apply against live
 * systems. Fetch wiring is intentionally minimal and behind a read-only fetch helper so
 * a reviewer can confirm no write path exists.
 */

import { dedupKey } from '../src/modules/sync/ingest.js';
import { logger } from '../src/logger.js';

const log = logger.child({ module: 'backfill' });

interface Args {
  apply: boolean;
  days: number;
  location: string | null;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, days: 90, location: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--days') args.days = parseInt(argv[++i] ?? '90', 10) || 90;
    else if (a === '--location') args.location = argv[++i] ?? null;
  }
  return args;
}

export interface RawAppointment {
  source: 'ghl' | 'drchrono';
  action: string;
  externalId: string;
  payload: Record<string, unknown>;
}

export interface Summary {
  fetched: number;
  bySource: Record<string, number>;
  inserted: number;
  skippedExisting: number;
  wouldInsert: number;
}

/**
 * Core backfill over an in-memory list of fetched appointments. Pure w.r.t. EHR reads
 * (callers supply the list); the only side effect is the optional sync_events insert.
 * Returns a summary. `insertFn` is injectable so this is unit-testable without a DB.
 */
export async function backfill(
  appts: RawAppointment[],
  apply: boolean,
  insertFn?: (a: RawAppointment, key: string) => Promise<boolean>,
): Promise<Summary> {
  const summary: Summary = {
    fetched: appts.length,
    bySource: {},
    inserted: 0,
    skippedExisting: 0,
    wouldInsert: 0,
  };

  for (const a of appts) {
    summary.bySource[a.source] = (summary.bySource[a.source] ?? 0) + 1;
    const key = dedupKey({
      source: a.source,
      action: a.action,
      externalId: a.externalId,
      payload: a.payload,
    });

    if (!apply) {
      summary.wouldInsert++;
      continue;
    }
    const insert = insertFn ?? defaultInsert;
    const didInsert = await insert(a, key);
    if (didInsert) summary.inserted++;
    else summary.skippedExisting++;
  }

  return summary;
}

/** Real insert into sync_events with dedup. Only used under --apply. */
async function defaultInsert(a: RawAppointment, key: string): Promise<boolean> {
  const { db } = await import('../src/db/pg/client.js');
  const { syncEvents } = await import('../src/db/pg/schema/sync.js');
  const rows = await db
    .insert(syncEvents)
    .values({
      source: a.source,
      action: a.action,
      payload: a.payload,
      status: 'pending',
      dedupKey: key,
    })
    .onConflictDoNothing({ target: syncEvents.dedupKey })
    .returning({ id: syncEvents.id });
  return rows.length > 0;
}

/**
 * Fetch appointments from both EHRs for the window. READ-ONLY.
 *
 * Sources:
 *   DrChrono — paginated GET /api/appointments?date_range=START/END via
 *               `drChronoAPIClient`, using the stored per-location OAuth token.
 *   GHL       — paginated GET /calendars/events?locationId=...&startTime=...&endTime=...
 *               using the per-location GHL access token from the identity module.
 *
 * Errors for a single location are caught, logged, and skipped — they do NOT abort
 * the entire fetch so the backfill is resilient to individual location auth failures.
 */
export async function fetchWindow(days: number, locationFilter: string | null): Promise<RawAppointment[]> {
  const results: RawAppointment[] = [];

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  const startDate = fmtDate(start);
  const endDate = fmtDate(now);
  const startEpoch = start.getTime();
  const endEpoch = now.getTime();

  // ---- DrChrono ---------------------------------------------------------------
  try {
    const { DrChronoConfigModel } = await import('../src/models/drchronoConfig.js');
    const { drChronoAPIClient, drChronoAuth } = await import('../src/modules/drchrono/services.js');
    // DrChrono has a single config document with an embedded locations array.
    const cfg = await DrChronoConfigModel.findOne({});
    const clientId = String(cfg?.clientId ?? '');
    const clientSecret = String(cfg?.clientSecret ?? '');
    const locations = (cfg?.locations ?? []) as Array<{
      locationId?: string;
      name?: string;
      accessToken?: string;
      refreshToken?: string;
      tokenExpiry?: number;
    }>;

    for (const loc of locations) {
      const locationId = String(loc.locationId ?? loc.name ?? '');
      if (!locationId) continue;
      if (locationFilter && locationId !== locationFilter) continue;

      try {
        const tokenResp = await drChronoAuth.getValidToken(
          String(loc.name ?? locationId),
          clientId,
          clientSecret,
          loc.accessToken ?? '',
          loc.refreshToken ?? '',
          loc.tokenExpiry ?? 0,
        );
        if (tokenResp.status !== 200 || !tokenResp.accessToken) {
          log.warn({ locationId }, 'backfill: DrChrono token refresh failed — skipping');
          continue;
        }

        const client = drChronoAPIClient(tokenResp.accessToken);
        const resp = await client.getAppointments(startDate, endDate);
        if (resp.status < 200 || resp.status >= 300) {
          log.warn({ locationId, status: resp.status }, 'backfill: DrChrono appointment fetch failed — skipping');
          continue;
        }

        const appts = resp.data as Array<Record<string, unknown>>;
        for (const a of appts) {
          results.push({
            source: 'drchrono',
            action: 'appointment.create',
            externalId: String(a.id),
            payload: a,
          });
        }
        log.info({ locationId, count: appts.length }, 'backfill: DrChrono appointments fetched');
      } catch (locErr) {
        log.warn({ locationId, err: locErr }, 'backfill: DrChrono location error — skipping');
      }
    }
  } catch (err) {
    log.warn({ err }, 'backfill: DrChrono config load failed — skipping DrChrono');
  }

  // ---- GHL --------------------------------------------------------------------
  try {
    const { AccessTokenModel } = await import('../src/models/accessToken.js');
    const { cryptoService } = await import('../src/utils/crypto.js');
    const { ghlTokenService } = await import('../src/modules/identity/services.js');
    const GHL_API_URL = process.env.GHL_API_URL || 'https://services.leadconnectorhq.com';

    const tokenRows = await AccessTokenModel.find({}).lean();
    for (const row of tokenRows) {
      const locationId = String(row.location ?? '');
      if (!locationId) continue;
      if (locationFilter && locationId !== locationFilter) continue;

      try {
        let decrypted: { access_token: string; refresh_token: string };
        try {
          decrypted = cryptoService.decrypt(row.token as string) as typeof decrypted;
        } catch {
          log.warn({ locationId }, 'backfill: GHL token decrypt failed — skipping');
          continue;
        }

        // Attempt refresh to get a fresh access token; fall back to cached on failure.
        let accessToken = decrypted.access_token;
        try {
          const renewed = await ghlTokenService.renewAuthToken(decrypted.refresh_token);
          accessToken = renewed.access_token;
        } catch {
          log.warn({ locationId }, 'backfill: GHL token refresh failed — using cached token');
        }

        // Paginate GHL calendar events.
        let page = 1;
        let hasMore = true;
        const locationAppts: RawAppointment[] = [];
        while (hasMore) {
          const params = new URLSearchParams({
            locationId,
            startTime: String(startEpoch),
            endTime: String(endEpoch),
            page: String(page),
          });
          const resp = await fetch(`${GHL_API_URL}/calendars/events?${params}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Version: '2021-04-15',
            },
          });
          if (!resp.ok) {
            log.warn({ locationId, status: resp.status, page }, 'backfill: GHL events fetch failed — stopping pagination');
            break;
          }
          const body = (await resp.json()) as { events?: Array<Record<string, unknown>>; meta?: { currentPage?: number; nextPage?: number } };
          const events = body.events ?? [];
          for (const e of events) {
            locationAppts.push({
              source: 'ghl',
              action: 'AppointmentCreate',
              externalId: String(e.id),
              payload: e,
            });
          }
          const meta = body.meta;
          if (meta?.nextPage && Number(meta.nextPage) > page) {
            page = Number(meta.nextPage);
          } else {
            hasMore = false;
          }
        }
        results.push(...locationAppts);
        log.info({ locationId, count: locationAppts.length }, 'backfill: GHL appointments fetched');
      } catch (locErr) {
        log.warn({ locationId, err: locErr }, 'backfill: GHL location error — skipping');
      }
    }
  } catch (err) {
    log.warn({ err }, 'backfill: GHL token load failed — skipping GHL');
  }

  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  log.info({ ...args, mode: args.apply ? 'APPLY' : 'DRY-RUN' }, 'backfill starting');

  const appts = await fetchWindow(args.days, args.location);
  const summary = await backfill(appts, args.apply);

  // Single JSON summary to stdout.
  console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', ...args, summary }, null, 2));

  if (args.apply) {
    const { sql } = await import('../src/db/pg/client.js');
    await sql.end({ timeout: 5 });
  }
}

// Only auto-run when invoked directly (not when imported by a test).
const isDirect = process.argv[1] && process.argv[1].endsWith('backfill-appointments.ts');
if (isDirect) {
  main().catch((err) => {
    log.error({ err }, 'backfill failed');
    process.exit(1);
  });
}
