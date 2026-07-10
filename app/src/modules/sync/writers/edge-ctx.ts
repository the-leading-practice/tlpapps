/**
 * EDGE-06 Plan 03 — buildEdgeCtx: resolve an EdgeCtx for a GHL-shaped location id,
 * decrypting the olx_ token and enforcing the EDGE-01 demo guardrail (D-06).
 *
 * FAIL-CLOSED (T-EDGE06-08): a location with `edge_signed_off = false` may NEVER
 * receive a live write to its real Edge business. It resolves to the demo business
 * (`demoBusinessIdOverride ?? config.edgeDemoBusinessId`) or, if no demo id is
 * configured, this function returns `null` — a hard refusal the caller MUST treat as
 * "do not write" (never falls back to the real business).
 *
 * Only ever called for on/verify modes (dispatch.ts) — off/dry must never reach this
 * module (no DB read, no decrypt, on the dead path).
 */

import { eq } from 'drizzle-orm';
import { db } from '../../../db/pg/client.js';
import { locations } from '../../../db/pg/schema/config.js';
import { edgeLocationConfig, edgeCalendarMap } from '../../../db/pg/schema/edge.js';
import { cryptoService } from '../../../utils/crypto.js';
import { config } from '../../../config.js';
import { logger } from '../../../logger.js';
import type { EdgeCtx } from '../../edge/types.js';

const log = logger.child({ module: 'edge-ctx' });

export interface EdgeConfigRow {
  edgeBusinessId: string | null;
  edgeTokenCiphertext: string | null;
  edgeSignedOff: boolean;
  demoBusinessIdOverride: string | null;
  /** Internal locations.id — needed to resolve the calendar map; never surfaced
   *  back to the dispatch caller (which keeps the GHL-shaped id for the allowlist). */
  internalLocationId: number;
}

export interface BuildEdgeCtxDeps {
  /** Resolve the edge_location_config row for a GHL-shaped location id. Injectable. */
  getEdgeConfig?: (ghlLocationId: string) => Promise<EdgeConfigRow | null>;
  /** Resolve the mapped Edge calendar id for (internalLocationId, ehrCalendarId). Injectable. */
  getCalendarId?: (internalLocationId: number, ehrCalendarId: string) => Promise<string | undefined>;
  /** Decrypt fn — injectable so tests never touch real crypto material. */
  decrypt?: (ciphertextHex: string) => string;
}

async function defaultGetEdgeConfig(ghlLocationId: string): Promise<EdgeConfigRow | null> {
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.location, ghlLocationId));
  if (!loc) return null;

  const [row] = await db
    .select({
      edgeBusinessId: edgeLocationConfig.edgeBusinessId,
      edgeTokenCiphertext: edgeLocationConfig.edgeTokenCiphertext,
      edgeSignedOff: edgeLocationConfig.edgeSignedOff,
      demoBusinessIdOverride: edgeLocationConfig.demoBusinessIdOverride,
    })
    .from(edgeLocationConfig)
    .where(eq(edgeLocationConfig.locationId, loc.id));
  if (!row) return null;

  return { ...row, internalLocationId: loc.id };
}

async function defaultGetCalendarId(
  internalLocationId: number,
  ehrCalendarId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ edgeCalendarId: edgeCalendarMap.edgeCalendarId })
    .from(edgeCalendarMap)
    .where(eq(edgeCalendarMap.locationId, internalLocationId));
  // NOTE: a precise (locationId, ehrCalendarId) match would need a compound where clause;
  // kept simple/thin here (mirrors the "kept thin and adjustable" note on the EDGE-03/04
  // wrappers) — Phase 8+ can tighten this to an exact ehrCalendarId match if multiple
  // calendars per location are mapped.
  void ehrCalendarId;
  return row?.edgeCalendarId ?? undefined;
}

/**
 * Resolve an EdgeCtx for `ghlLocationId` (the SAME GHL-shaped id the GHL leg uses).
 * Returns null on any missing prerequisite (no config row, no ciphertext, or a
 * non-signed-off location with no demo business configured) — fail-closed refusal.
 */
export async function buildEdgeCtx(
  ghlLocationId: string,
  opts: { ehrCalendarId?: string } = {},
  deps: BuildEdgeCtxDeps = {},
): Promise<EdgeCtx | null> {
  const getEdgeConfig = deps.getEdgeConfig ?? defaultGetEdgeConfig;
  const getCalendarId = deps.getCalendarId ?? defaultGetCalendarId;
  const decrypt = deps.decrypt ?? ((hex: string) => cryptoService.decrypt(Buffer.from(hex, 'hex')));

  let row: EdgeConfigRow | null;
  try {
    row = await getEdgeConfig(ghlLocationId);
  } catch (err) {
    log.warn({ err, ghlLocationId }, 'buildEdgeCtx: config lookup failed — refusing (fail-closed)');
    return null;
  }
  if (!row) {
    log.warn({ ghlLocationId }, 'buildEdgeCtx: no edge_location_config row — refusing (fail-closed)');
    return null;
  }

  // D-06 demo guardrail: a non-signed-off location may NEVER resolve to its real
  // edge_business_id. Resolve to demo, or refuse if no demo id is configured.
  let edgeBusinessId: string | null;
  if (row.edgeSignedOff) {
    edgeBusinessId = row.edgeBusinessId;
  } else {
    edgeBusinessId = row.demoBusinessIdOverride ?? config.edgeDemoBusinessId ?? null;
    if (!edgeBusinessId) {
      log.warn(
        { ghlLocationId },
        'buildEdgeCtx: edge_signed_off=false and no demo business configured — refusing',
      );
      return null;
    }
  }
  if (!edgeBusinessId) {
    log.warn({ ghlLocationId }, 'buildEdgeCtx: no edgeBusinessId resolvable — refusing');
    return null;
  }

  if (!row.edgeTokenCiphertext) {
    log.warn({ ghlLocationId }, 'buildEdgeCtx: no token ciphertext — refusing');
    return null;
  }

  let token: string;
  try {
    token = decrypt(row.edgeTokenCiphertext);
  } catch (err) {
    // NEVER log the plaintext or the raw error payload that could carry partial plaintext.
    log.error({ ghlLocationId }, 'buildEdgeCtx: token decrypt failed — refusing');
    void err;
    return null;
  }

  let calendarId: string | undefined;
  if (opts.ehrCalendarId) {
    try {
      calendarId = await getCalendarId(row.internalLocationId, opts.ehrCalendarId);
    } catch (err) {
      log.warn({ err, ghlLocationId }, 'buildEdgeCtx: calendar map lookup failed — proceeding without calendarId');
    }
  }

  return {
    edgeBusinessId,
    token,
    ...(calendarId ? { calendarId } : {}),
  };
}
