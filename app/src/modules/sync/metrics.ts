/**
 * P10 T02 — In-process sync counters.
 *
 * All counters are best-effort (reset on process restart). Durable counts come
 * from PG queries. Designed for quick operational visibility.
 *
 * Usage:
 *   import { syncCounters } from './metrics.js';
 *   syncCounters.inc('sync_writes_attempted', 'drchrono_to_ghl');
 *
 * Exposed via GET /api/sync/metrics (JSON or ?format=prom).
 */

export type MetricName =
  | 'sync_writes_attempted'
  | 'sync_writes_succeeded'
  | 'sync_writes_failed'
  | 'sync_writes_skipped_loop'
  | 'sync_writes_skipped_off'
  | 'sync_dry_run_actions'
  | 'sync_dead_letter_count'
  | 'sync_conflict_queue_size'
  | 'patients_dual_write_pg_fail';

export type Direction = 'drchrono_to_ghl' | 'ghl_to_drchrono' | 'drchrono_to_edge' | 'edge_to_drchrono';

type PerDirection = Record<Direction, { attempted: number; succeeded: number; failed: number }>;

const METRIC_NAMES: MetricName[] = [
  'sync_writes_attempted',
  'sync_writes_succeeded',
  'sync_writes_failed',
  'sync_writes_skipped_loop',
  'sync_writes_skipped_off',
  'sync_dry_run_actions',
  'sync_dead_letter_count',
  'sync_conflict_queue_size',
  'patients_dual_write_pg_fail',
];

const _counters: Record<MetricName, number> = Object.fromEntries(
  METRIC_NAMES.map((k) => [k, 0]),
) as Record<MetricName, number>;

const _perDirection: PerDirection = {
  drchrono_to_ghl: { attempted: 0, succeeded: 0, failed: 0 },
  ghl_to_drchrono: { attempted: 0, succeeded: 0, failed: 0 },
  drchrono_to_edge: { attempted: 0, succeeded: 0, failed: 0 },
  edge_to_drchrono: { attempted: 0, succeeded: 0, failed: 0 },
};

function inc(name: MetricName, direction?: Direction): void {
  _counters[name]++;
  if (
    direction &&
    (name === 'sync_writes_attempted' ||
      name === 'sync_writes_succeeded' ||
      name === 'sync_writes_failed')
  ) {
    const key =
      name === 'sync_writes_attempted'
        ? 'attempted'
        : name === 'sync_writes_succeeded'
          ? 'succeeded'
          : 'failed';
    _perDirection[direction][key]++;
  }
}

function set(name: MetricName, value: number): void {
  _counters[name] = value;
}

function snapshot() {
  return {
    ..._counters,
    per_direction: {
      drchrono_to_ghl: { ..._perDirection.drchrono_to_ghl },
      ghl_to_drchrono: { ..._perDirection.ghl_to_drchrono },
      drchrono_to_edge: { ..._perDirection.drchrono_to_edge },
      edge_to_drchrono: { ..._perDirection.edge_to_drchrono },
    },
  };
}

function toPrometheus(): string {
  const lines: string[] = [];
  for (const name of METRIC_NAMES) {
    lines.push(`# HELP ${name} TLP sync counter`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${_counters[name]}`);
  }
  for (const [dir, vals] of Object.entries(_perDirection) as [Direction, { attempted: number; succeeded: number; failed: number }][]) {
    for (const [k, v] of Object.entries(vals)) {
      lines.push(`sync_writes_${k}{direction="${dir}"} ${v}`);
    }
  }
  return lines.join('\n') + '\n';
}

/** Exported singleton — import and call inc() / set() from engine/writers/helpers. */
export const syncCounters = { inc, set, snapshot, toPrometheus };
