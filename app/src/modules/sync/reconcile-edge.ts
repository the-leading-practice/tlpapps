/**
 * EDGE-10 Plan 01 (ECUT-02) — GHL <-> Edge drift reconciliation.
 *
 * REPORT-ONLY. For one location over the last N days, compares the mapped GHL
 * state vs the mapped Edge state via `sync_mappings` (contacts + appointments)
 * and reports drift counts + per-entity diffs. Fires the existing
 * `reconciliation_drift` alert when drift exceeds the 0.1% threshold.
 *
 * `applyFix` is the ONLY flag that could ever mutate anything; it defaults to
 * `false` and, when `true`, THROWS rather than performing a write — this phase
 * ships zero write statements on any path (fail-safe default, matches the
 * D-02/D-03 fail-CLOSED lesson from the P14 sync_controls incident).
 */

import { and, eq, gte } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { syncMappings } from '../../db/pg/schema/sync.js';
import { logger } from '../../logger.js';
import { triggerAlert } from './alerts.js';

const log = logger.child({ module: 'sync-reconcile-edge' });

const DRIFT_ALERT_THRESHOLD_PCT = 0.1;

export type DriftReason = 'missing-edge' | 'missing-ghl' | 'field-mismatch';

export interface DriftDiff {
  kind: 'patient' | 'appointment';
  mappingId: string;
  drchronoId: string;
  ghlId: string | null;
  edgeId: string | null;
  reason: DriftReason;
  detail?: Record<string, unknown>;
}

export interface ReconcileEdgeInput {
  /** Postgres locations.id — the practice location being reconciled. */
  locationId: number;
  /** Look-back window in days. */
  days: number;
  /** ONLY path that could mutate. Default false. `true` always throws (not
   * implemented this phase) — never a silent no-op, never a silent write. */
  applyFix?: boolean;
}

/** Row shape returned by the (injectable) mapping query. */
export interface MappingRow {
  id: string;
  kind: 'patient' | 'appointment';
  drchronoId: string;
  ghlId: string | null;
  edgeId: string | null;
}

export interface ReconcileDeps {
  /** Injectable mapping fetch (default: real sync_mappings query). Tests inject
   * a fixture array/fn so no DB is touched. */
  queryMappings?: (locationId: number, days: number) => Promise<MappingRow[]>;
  /** Injectable per-contact readers for the OPTIONAL field-level diff pass.
   * When either is omitted, field-level compare is skipped entirely (no
   * network) — mapping-completeness drift (missing-edge/missing-ghl) is
   * always computed from `sync_mappings` alone regardless. */
  ghlReadContact?: (ghlId: string) => Promise<unknown>;
  edgeReadContact?: (edgeId: string) => Promise<unknown>;
  /** Injectable alert dispatcher (default: real triggerAlert). */
  triggerAlertFn?: typeof triggerAlert;
}

export interface ReconcileEdgeReport {
  locationId: number;
  days: number;
  totals: { contacts: number; appointments: number };
  drift: { missingEdge: number; missingGhl: number; fieldMismatch: number };
  driftPct: number;
  diffs: DriftDiff[];
}

/**
 * Compare mapped GHL state vs mapped Edge state for one location over the last
 * N days. Read-only: no GHL/Edge/DrChrono/sync_mappings mutation on any path.
 */
export async function reconcileEdgeDrift(
  input: ReconcileEdgeInput,
  deps: ReconcileDeps = {},
): Promise<ReconcileEdgeReport> {
  if (input.applyFix) {
    // Fail-safe default: report-only is the only behavior this phase ships.
    // Never silently mutate — throw loudly instead.
    throw new Error('drift auto-fix not enabled');
  }

  const queryMappings = deps.queryMappings ?? defaultQueryMappings;
  const rows = await queryMappings(input.locationId, input.days);

  let missingEdge = 0;
  let missingGhl = 0;
  let fieldMismatch = 0;
  let contacts = 0;
  let appointments = 0;
  const diffs: DriftDiff[] = [];

  const canFieldCompare = !!(deps.ghlReadContact && deps.edgeReadContact);

  for (const row of rows) {
    if (row.kind === 'patient') contacts++;
    else appointments++;

    const hasGhl = !!row.ghlId;
    const hasEdge = !!row.edgeId;

    if (hasGhl && !hasEdge) {
      missingEdge++;
      diffs.push({
        kind: row.kind,
        mappingId: row.id,
        drchronoId: row.drchronoId,
        ghlId: row.ghlId,
        edgeId: row.edgeId,
        reason: 'missing-edge',
      });
      continue;
    }

    if (hasEdge && !hasGhl) {
      missingGhl++;
      diffs.push({
        kind: row.kind,
        mappingId: row.id,
        drchronoId: row.drchronoId,
        ghlId: row.ghlId,
        edgeId: row.edgeId,
        reason: 'missing-ghl',
      });
      continue;
    }

    if (hasGhl && hasEdge && canFieldCompare && row.kind === 'patient') {
      try {
        const [ghlVal, edgeVal] = await Promise.all([
          deps.ghlReadContact!(row.ghlId as string),
          deps.edgeReadContact!(row.edgeId as string),
        ]);
        if (JSON.stringify(ghlVal ?? null) !== JSON.stringify(edgeVal ?? null)) {
          fieldMismatch++;
          diffs.push({
            kind: row.kind,
            mappingId: row.id,
            drchronoId: row.drchronoId,
            ghlId: row.ghlId,
            edgeId: row.edgeId,
            reason: 'field-mismatch',
            detail: { ghlVal, edgeVal },
          });
        }
      } catch (err) {
        // Field-level compare is best-effort; a read failure is NOT drift —
        // log and move on rather than mis-reporting a false positive.
        log.warn({ err, mappingId: row.id }, 'reconcileEdgeDrift: field-level read failed, skipped');
      }
    }
  }

  const total = rows.length;
  const driftCount = missingEdge + missingGhl + fieldMismatch;
  const driftPct = total > 0 ? (driftCount / total) * 100 : 0;

  if (driftPct > DRIFT_ALERT_THRESHOLD_PCT) {
    const fire = deps.triggerAlertFn ?? triggerAlert;
    fire('reconciliation_drift', { driftPct, locationId: input.locationId }).catch(() => undefined);
  }

  return {
    locationId: input.locationId,
    days: input.days,
    totals: { contacts, appointments },
    drift: { missingEdge, missingGhl, fieldMismatch },
    driftPct,
    diffs,
  };
}

/** Default mapping fetch: sync_mappings scoped to locationId + last N days. */
async function defaultQueryMappings(locationId: number, days: number): Promise<MappingRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(syncMappings)
    .where(and(eq(syncMappings.locationId, locationId), gte(syncMappings.lastSyncedAt, since)));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    drchronoId: r.drchronoId,
    ghlId: r.ghlId || null,
    edgeId: (r as unknown as { edgeId: string | null }).edgeId ?? null,
  }));
}
