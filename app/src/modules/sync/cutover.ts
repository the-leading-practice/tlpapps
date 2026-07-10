/**
 * EDGE-10 Plan 03 (ECUT-03, Option B) — per-location GHL -> Edge cutover.
 *
 * Cutover(location A) = remove A from the GHL allowlist bucket (write a DB
 * deny-row for destination='ghl') + add A to the Edge allowlist bucket (write
 * a DB allow-row for destination='edge'). Both rows are written in ONE
 * transaction (no half-move). Location B is never touched.
 *
 * Fail-CLOSED gate order:
 *   1. edge_location_config.edge_signed_off must be true for this location.
 *   2. envCeilingForDirection('drchrono_to_edge') must be 'on'.
 * Either failing => refuse with ZERO allowlist writes.
 *
 * Never mutates sync_controls (modes stay GLOBAL) or edge_signed_off — cutover
 * moves ALLOWLIST membership only.
 */

import { eq, sql as sqlTag } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { locations } from '../../db/pg/schema/config.js';
import { edgeLocationConfig } from '../../db/pg/schema/edge.js';
import { syncWriteAllowlist } from '../../db/pg/schema/sync.js';
import { envCeilingForDirection } from './writers/dispatch.js';
import { invalidateAllowlistCache } from './writers/allowlist.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-cutover' });

export type CutoverRefusedReason =
  | 'location_not_found'
  | 'not_signed_off'
  | 'edge_ceiling_below_on';

export type CutoverResult =
  | {
      ok: true;
      location: string;
      moved: { ghl: 'removed'; edge: 'added' };
    }
  | {
      ok: false;
      refused: CutoverRefusedReason;
    };

export interface CutoverDeps {
  /** Injected drizzle db handle (tests). Defaults to the real db. */
  dbHandle?: typeof db;
  /** Injected env (tests). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Stamp for updated_by on the allowlist rows. */
  updatedBy?: string;
}

/**
 * Move `locationId` (numeric locations.id) from the GHL allowlist to the Edge
 * allowlist. Fail-closed: refuses (zero writes) unless the location's
 * edge_location_config.edge_signed_off is true AND the drchrono_to_edge env
 * ceiling is 'on'. Transactional: both allowlist rows are written together or
 * neither is.
 */
export async function cutoverLocationToEdge(
  locationId: number,
  deps: CutoverDeps = {},
): Promise<CutoverResult> {
  const dbh = deps.dbHandle ?? db;
  const env = deps.env ?? process.env;

  // Step 1: gate — signed-off check. ZERO writes if missing/false.
  const [edgeCfg] = await dbh
    .select({ edgeSignedOff: edgeLocationConfig.edgeSignedOff })
    .from(edgeLocationConfig)
    .where(eq(edgeLocationConfig.locationId, locationId));

  if (!edgeCfg || edgeCfg.edgeSignedOff !== true) {
    log.warn({ locationId }, 'cutover refused — not signed off');
    return { ok: false, refused: 'not_signed_off' };
  }

  // Step 2: gate — env ceiling. ZERO writes if not 'on'.
  const ceiling = envCeilingForDirection('drchrono_to_edge', env);
  if (ceiling !== 'on') {
    log.warn({ locationId, ceiling }, 'cutover refused — edge ceiling below on');
    return { ok: false, refused: 'edge_ceiling_below_on' };
  }

  // Step 3: resolve numeric locations.id -> GHL-shaped location string.
  const [loc] = await dbh
    .select({ location: locations.location })
    .from(locations)
    .where(eq(locations.id, locationId));

  if (!loc) {
    log.warn({ locationId }, 'cutover refused — location not found');
    return { ok: false, refused: 'location_not_found' };
  }

  const ghlLoc = loc.location;
  const updatedBy = deps.updatedBy ?? 'operator';

  // Step 4: move — one transaction, both rows or neither.
  await dbh.transaction(async (tx) => {
    await tx
      .insert(syncWriteAllowlist)
      .values({ destination: 'ghl', locationId: ghlLoc, allowed: false, updatedBy })
      .onConflictDoUpdate({
        target: [syncWriteAllowlist.destination, syncWriteAllowlist.locationId],
        set: { allowed: false, updatedAt: new Date(), updatedBy },
      });

    await tx
      .insert(syncWriteAllowlist)
      .values({ destination: 'edge', locationId: ghlLoc, allowed: true, updatedBy })
      .onConflictDoUpdate({
        target: [syncWriteAllowlist.destination, syncWriteAllowlist.locationId],
        set: { allowed: true, updatedAt: new Date(), updatedBy },
      });
  });

  // Step 5: invalidate the in-process snapshot immediately (single-container
  // monolith today) + pg_notify for any future replica.
  invalidateAllowlistCache();
  try {
    await dbh.execute(sqlTag`SELECT pg_notify('sync_write_allowlist_changed', ${ghlLoc})`);
  } catch (err) {
    log.warn({ err, locationId, ghlLoc }, 'cutover: pg_notify failed (non-fatal)');
  }

  log.info({ locationId, ghlLoc }, 'cutover: location moved GHL -> Edge');

  return { ok: true, location: ghlLoc, moved: { ghl: 'removed', edge: 'added' } };
}
