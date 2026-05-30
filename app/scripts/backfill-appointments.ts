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
 * Fetch appointments from both EHRs for the window. READ-ONLY. Returns [] here as a
 * placeholder — the concrete paginated GHL/DrChrono read wiring lands when the user
 * enables backfill against a real location (it reuses the per-location tokens the live
 * sync uses). Kept explicit + empty so dry-run is safe to run anywhere and a reviewer
 * can confirm no write endpoint is touched.
 */
export async function fetchWindow(_days: number, _location: string | null): Promise<RawAppointment[]> {
  log.warn('fetchWindow: live EHR read wiring is gated to enablement — returning empty set');
  return [];
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
