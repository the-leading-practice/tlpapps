/**
 * HEAL-01 — silent-wrong INVARIANT-CHECK layer (self-heal Tier-0 foundation).
 *
 * Ships DARK: alert-only, READ-ONLY, behind the default-OFF `RUN_INVARIANTS` flag.
 * NO auto-remediation, NO writes to EHR/GHL, NO DB mutation (SELECT only), NO LLM.
 *
 * Each invariant is a cheap check that must always hold. On violation it emits
 * `triggerAlert('invariant_violation', { invariant, detail, severity, tier })`
 * (Telegram sink, per-invariant 10-min dedupe). A check that THROWS is itself an
 * alertable failure — one failing check never stops the others (each is wrapped in
 * try/catch in the loop).
 *
 * Design: `tlpapps/.planning/SELF-HEAL-DESIGN.md` §3 (invariants I1–I10).
 * HEAL-01 ships the cheap pure-PG/env set: I1, I2, I3, I6, I7, I9.
 * I4, I5, I8, I10 are deferred (TODO stubs below) — see the design doc.
 */

import { count, eq } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { syncDeadLetter, syncConflicts } from '../../db/pg/schema/sync.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { triggerAlert } from './alerts.js';
import {
  buildAllowlist,
  FORBIDDEN_LOCATION_IDS,
} from './writers/allowlist.js';
import { accessTokenService } from '../identity/services.js';
import type { Token } from '../identity/types.js';
import { cryptoService } from '../../utils/crypto.js';

const log = logger.child({ module: 'sync-invariants' });

/** A single invariant's evaluation result. */
export interface InvariantResult {
  id: string;
  description: string;
  ok: boolean;
  detail: string;
  /** Self-heal tier on violation (per design doc); informational. */
  tier?: 'Tier 1' | 'Tier 2';
}

interface Invariant {
  id: string;
  description: string;
  tier: 'Tier 1' | 'Tier 2';
  /** Alert severity on violation (Tier 2 = Error, Tier 1 = Warn). */
  severity: 'Warn' | 'Error';
  check(): Promise<{ ok: boolean; detail: string }>;
}

// --- Invariant implementations ------------------------------------------------

/**
 * I1 (Tier 2) — DND read-back. The DND-incident regression check.
 * For each allowlisted live location, read the EXISTING stored GHL access token AS-IS
 * and GET a bounded sample of contacts, counting those carrying tag `api` AND
 * `dnd:true`. If any such contact exists while GHL_SUPPRESS_AUTOMATION !== true, the
 * live data is already silently wrong (the exact bug we fixed).
 *
 * STRICTLY READ-ONLY: the only outbound call is GET /contacts. The invariant NEVER
 * rotates a token (no renewAuthToken / OAuth POST) and NEVER persists (no DB UPDATE).
 * If a location has no stored token, an undecodable token, or the stored token is
 * rejected (401/403), the read-back is SKIPPED for that location this pass — a skip is
 * NOT a violation and triggers no write.
 */
const i1: Invariant = {
  id: 'I1',
  description:
    'No synced contact carries dnd:true (with tag `api`) unless GHL_SUPPRESS_AUTOMATION=true',
  tier: 'Tier 2',
  severity: 'Error',
  async check() {
    const allowlist = buildAllowlist(process.env);
    if (allowlist === null || allowlist.size === 0) {
      return { ok: true, detail: 'no allowlisted live locations — nothing to read back' };
    }

    const suppressOn = config.ghl.suppressAutomation === true;
    const offenders: string[] = [];
    const skipped: string[] = [];
    let sampled = 0;
    let totalDnd = 0;

    for (const locationId of allowlist) {
      const token = await readStoredAccessToken(locationId);
      if (!token) {
        // No fresh/usable token — DO NOT rotate. Skip the read-back this pass.
        skipped.push(locationId);
        continue;
      }

      const dndApiCount = await countDndApiContacts(locationId, token);
      if (dndApiCount === null) {
        // Stored token rejected (401/403) — skip, never rotate.
        skipped.push(locationId);
        continue;
      }
      sampled++;
      if (dndApiCount > 0) {
        totalDnd += dndApiCount;
        offenders.push(`${locationId}:${dndApiCount}`);
      }
    }

    const skipNote = skipped.length > 0 ? ` (skipped ${skipped.length}: no fresh token, not rotating — [${skipped.join(',')}])` : '';

    if (offenders.length > 0 && !suppressOn) {
      return {
        ok: false,
        detail: `${totalDnd} contact(s) tagged \`api\` carry dnd:true while GHL_SUPPRESS_AUTOMATION!=true — [${offenders.join(', ')}]${skipNote}`,
      };
    }

    return {
      ok: true,
      detail: suppressOn
        ? `GHL_SUPPRESS_AUTOMATION=true — dnd:true is expected (sampled ${sampled} location(s))${skipNote}`
        : `no dnd:true \`api\` contacts found (sampled ${sampled} location(s))${skipNote}`,
    };
  },
};

/**
 * I2 (Tier 2) — allowlist posture. SYNC_WRITE_LOCATION_ALLOWLIST must contain NONE
 * of the 5 forbidden real-practice IDs. Pure env/string check.
 */
const i2: Invariant = {
  id: 'I2',
  description: 'SYNC_WRITE_LOCATION_ALLOWLIST contains none of the forbidden real-practice IDs',
  tier: 'Tier 2',
  severity: 'Error',
  async check() {
    const raw = (process.env.SYNC_WRITE_LOCATION_ALLOWLIST ?? '').trim();
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const leaked = ids.filter((id) => FORBIDDEN_LOCATION_IDS.has(id));
    if (leaked.length > 0) {
      return { ok: false, detail: `forbidden IDs present in allowlist: ${leaked.join(',')}` };
    }
    return { ok: true, detail: `allowlist clean (${ids.length} id(s))` };
  },
};

/**
 * I3 (Tier 2) — forbidden-id guard sanity. The FORBIDDEN_LOCATION_IDS safety set must
 * stay non-empty (someone emptying it would silently remove the hard block).
 */
const i3: Invariant = {
  id: 'I3',
  description: 'FORBIDDEN_LOCATION_IDS safety set is non-empty and intact',
  tier: 'Tier 2',
  severity: 'Error',
  async check() {
    const size = FORBIDDEN_LOCATION_IDS.size;
    if (size === 0) {
      return { ok: false, detail: 'FORBIDDEN_LOCATION_IDS is EMPTY — hard write-block disabled' };
    }
    return { ok: true, detail: `${size} forbidden IDs hard-blocked` };
  },
};

/**
 * I6 (Tier 1) — dead-letter threshold. Alert when sync_dead_letter total count
 * exceeds SELFHEAL_DLQ_THRESHOLD (default 25). SELECT only.
 */
const i6: Invariant = {
  id: 'I6',
  description: `sync_dead_letter count below threshold (${config.selfheal.dlqThreshold})`,
  tier: 'Tier 1',
  severity: 'Warn',
  async check() {
    const [row] = await db.select({ n: count() }).from(syncDeadLetter);
    const n = Number(row?.n ?? 0);
    const threshold = config.selfheal.dlqThreshold;
    if (n > threshold) {
      return { ok: false, detail: `${n} dead-letter rows > threshold ${threshold}` };
    }
    return { ok: true, detail: `${n} dead-letter rows (<= ${threshold})` };
  },
};

/**
 * I7 (Tier 1) — conflict growth. Alert when unresolved (resolution != 'pending'
 * cleared) sync_conflicts exceed SELFHEAL_CONFLICT_THRESHOLD (default 50). We count
 * rows still 'pending'. SELECT only.
 */
const i7: Invariant = {
  id: 'I7',
  description: `pending sync_conflicts below threshold (${config.selfheal.conflictThreshold})`,
  tier: 'Tier 1',
  severity: 'Warn',
  async check() {
    // Unresolved == resolution 'pending' (matches the existing conflict_queue alert).
    const [row] = await db
      .select({ n: count() })
      .from(syncConflicts)
      .where(eq(syncConflicts.resolution, 'pending'));
    const n = Number(row?.n ?? 0);
    const threshold = config.selfheal.conflictThreshold;
    if (n > threshold) {
      return { ok: false, detail: `${n} unresolved conflicts > threshold ${threshold}` };
    }
    return { ok: true, detail: `${n} unresolved conflicts (<= ${threshold})` };
  },
};

const EXPECTED_WRITE_MODES = new Set(['off', 'dry', 'verify', 'on']);

/**
 * I9 (Tier 2) — config posture baseline. The reverse leg
 * (SYNC_WRITE_GHL_TO_DRCHRONO) must NOT be 'on' (accidental env flip arming reverse
 * sync), and SYNC_WRITE_DRCHRONO_TO_GHL must be a recognised mode. Pure env check.
 */
const i9: Invariant = {
  id: 'I9',
  description: 'Write posture baseline: reverse leg not `on`; forward leg in expected set',
  tier: 'Tier 2',
  severity: 'Error',
  async check() {
    const reverse = (process.env.SYNC_WRITE_GHL_TO_DRCHRONO ?? 'off').trim();
    const forward = (process.env.SYNC_WRITE_DRCHRONO_TO_GHL ?? 'off').trim();
    const problems: string[] = [];
    if (reverse === 'on') {
      problems.push('SYNC_WRITE_GHL_TO_DRCHRONO=on (reverse sync must stay off)');
    }
    if (!EXPECTED_WRITE_MODES.has(forward)) {
      problems.push(`SYNC_WRITE_DRCHRONO_TO_GHL='${forward}' not in {off,dry,verify,on}`);
    }
    if (problems.length > 0) {
      return { ok: false, detail: problems.join('; ') };
    }
    return { ok: true, detail: `forward=${forward} reverse=${reverse}` };
  },
};

// TODO(HEAL-02/03): I4 (suppression-tag presence), I5 (origin-tag non-null),
// I8 (stuck-processing events), I10 (reconciliation drift). See SELF-HEAL-DESIGN.md §3.

const INVARIANTS: Invariant[] = [i1, i2, i3, i6, i7, i9];

// --- Runner -------------------------------------------------------------------

/**
 * Run all invariants once. READ-ONLY. Never throws — a check that throws is recorded
 * as its own failed result and alerted, and the loop continues with the rest.
 */
export async function runInvariants(): Promise<InvariantResult[]> {
  const results: InvariantResult[] = [];

  for (const inv of INVARIANTS) {
    let result: InvariantResult;
    try {
      const { ok, detail } = await inv.check();
      result = { id: inv.id, description: inv.description, ok, detail, tier: inv.tier };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log.error({ invariant: inv.id, err: detail }, 'invariant check threw');
      result = {
        id: inv.id,
        description: inv.description,
        ok: false,
        detail: `check threw: ${detail}`,
        tier: inv.tier,
      };
    }

    if (!result.ok) {
      triggerAlert('invariant_violation', {
        invariant: inv.id,
        detail: result.detail,
        severity: inv.severity,
        tier: inv.tier,
      }).catch(() => undefined);
      log.warn({ invariant: inv.id, detail: result.detail, tier: inv.tier }, 'invariant violation');
    } else {
      log.debug({ invariant: inv.id, detail: result.detail }, 'invariant ok');
    }

    results.push(result);
  }

  const violations = results.filter((r) => !r.ok).length;
  log.info({ total: results.length, violations }, 'invariant pass complete');
  return results;
}

// --- GHL read-back helper (READ-ONLY) -----------------------------------------

interface GhlContact {
  tags?: unknown;
  dnd?: unknown;
}

/**
 * Read the EXISTING stored GHL access token for a location and return it AS-IS.
 * READ-ONLY: decrypts the stored row only — never calls renewAuthToken (no OAuth POST)
 * and never persists (no updateToken / DB UPDATE). Returns null when no token row
 * exists or the stored blob is undecodable / lacks an access_token (caller skips).
 */
async function readStoredAccessToken(locationId: string): Promise<string | null> {
  try {
    const row = await accessTokenService.getTokenByLocation(locationId);
    if (!row || !row.token) return null;
    const json = cryptoService.decrypt(Buffer.from(row.token, 'hex'));
    const decoded = JSON.parse(json) as Token;
    return decoded.access_token || null;
  } catch (err) {
    log.warn({ locationId, err: (err as Error).message }, 'I1: stored token undecodable — skipping');
    return null;
  }
}

/**
 * Count contacts for a location that carry tag `api` AND dnd:true, sampling a bounded
 * single page (SELFHEAL_I1_MAX_CONTACTS, default 100). READ-ONLY GET; never mutates.
 * Returns the count, or `null` when the stored token is rejected (401/403) or the read
 * otherwise fails — the caller treats null as a SKIP (never rotates the token).
 */
async function countDndApiContacts(locationId: string, token: string): Promise<number | null> {
  const limit = Math.max(1, config.selfheal.i1MaxContacts);
  const url =
    `${config.ghl.apiUrl}/contacts/?locationId=${encodeURIComponent(locationId)}` +
    `&limit=${limit}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      version: config.ghl.apiVersion,
    },
  });

  if (!resp.ok) {
    // Stored token rejected or read failed — SKIP (return null). Never rotate here.
    log.warn({ locationId, status: resp.status }, 'I1: contacts read non-OK — skipping (no rotate)');
    return null;
  }

  const body = (await resp.json()) as { contacts?: GhlContact[] };
  const contacts = Array.isArray(body?.contacts) ? body.contacts : [];

  let n = 0;
  for (const c of contacts) {
    const tags = Array.isArray(c.tags) ? c.tags.map((t) => String(t).toLowerCase()) : [];
    const hasApiTag = tags.includes('api');
    const dnd = c.dnd === true;
    if (hasApiTag && dnd) n++;
  }
  return n;
}

// --- Cron lifecycle -----------------------------------------------------------

let invariantsTimer: NodeJS.Timeout | null = null;

/**
 * Start the independent invariant timer. NO-OP unless RUN_INVARIANTS=on. Decoupled
 * from RUN_CRON so invariants run WITHOUT arming the sync engine. Uses setInterval at
 * SELFHEAL_INVARIANTS_CRON cadence (default 15 min). Each pass is fire-and-forget;
 * a pass that rejects is logged and never crashes the process.
 */
export function initInvariantsCron(): void {
  if (!config.selfheal.runInvariants) {
    log.info('RUN_INVARIANTS disabled — invariant cron not started');
    return;
  }
  if (invariantsTimer) return;

  const cadence = Math.max(60_000, config.selfheal.invariantsCronMs);
  log.info({ cadenceMs: cadence }, 'starting self-heal invariant cron (read-only, dark)');

  const tick = () => {
    runInvariants().catch((err) => log.error({ err }, 'invariant pass failed'));
  };

  // Defer the first pass one cadence so boot stays cheap.
  invariantsTimer = setInterval(tick, cadence);
}

/** Stop the invariant timer (test/shutdown). */
export function stopInvariantsCron(): void {
  if (invariantsTimer) {
    clearInterval(invariantsTimer);
    invariantsTimer = null;
  }
}
