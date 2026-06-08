/**
 * P08 sync HTTP surface — mounted at `/api/sync` (auth required). Read views over
 * the sync event/conflict state plus operator actions (replay an event, resolve a
 * conflict). No EHR calls — replay just re-arms an event for the dry-run engine.
 */

import { Router, type Request, type Response } from 'express';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { syncEvents, syncConflicts, syncControls } from '../../db/pg/schema/sync.js';
import type { WriteMode } from './writers/dispatch.js';
import { logger } from '../../logger.js';
import { syncCounters } from './metrics.js';

const log = logger.child({ module: 'sync-routes' });
const router = Router();

/** GET /api/sync/metrics — in-process counters; ?format=prom for Prometheus text. */
router.get('/sync/metrics', async (req: Request, res: Response) => {
  if (req.query.format === 'prom') {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(syncCounters.toPrometheus());
    return;
  }
  // Hydrate live PG counts for dead-letter + conflict queue so the gauge is fresh.
  try {
    const [dlRow] = await db
      .select({ n: count() })
      .from(syncEvents)
      .where(eq(syncEvents.status, 'dead'));
    syncCounters.set('sync_dead_letter_count', Number(dlRow?.n ?? 0));

    const [cqRow] = await db
      .select({ n: count() })
      .from(syncConflicts)
      .where(eq(syncConflicts.resolution, 'pending'));
    syncCounters.set('sync_conflict_queue_size', Number(cqRow?.n ?? 0));
  } catch (err) {
    log.warn({ err }, 'metrics: failed to hydrate PG counts');
  }
  res.json(syncCounters.snapshot());
});

/** GET /api/sync/events?status=&limit= — recent sync events. */
router.get('/sync/events', async (req: Request, res: Response) => {
  const limit = clampLimit(req.query.limit);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const rows = await db
    .select()
    .from(syncEvents)
    .where(status ? eq(syncEvents.status, status as any) : undefined)
    .orderBy(desc(syncEvents.receivedAt))
    .limit(limit);
  res.json({ events: rows });
});

/**
 * POST /api/sync/events/replay/:id — re-arm an event so the engine reprocesses it.
 * Returns 202 (accepted; the engine picks it up on the next tick). Idempotent.
 */
router.post('/sync/events/replay/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const [existing] = await db.select().from(syncEvents).where(eq(syncEvents.id, id));
  if (!existing) {
    res.status(404).json({ error: 'event not found' });
    return;
  }
  await db
    .update(syncEvents)
    .set({ status: 'pending', processedAt: null, error: null })
    .where(eq(syncEvents.id, id));
  log.info({ eventId: id }, 'event re-armed for replay');
  res.status(202).json({ status: 'pending', id });
});

/** GET /api/sync/conflicts?resolution=&limit= — review queue. */
router.get('/sync/conflicts', async (req: Request, res: Response) => {
  const limit = clampLimit(req.query.limit);
  const resolution =
    typeof req.query.resolution === 'string' ? req.query.resolution : 'pending';
  const rows = await db
    .select()
    .from(syncConflicts)
    .where(eq(syncConflicts.resolution, resolution as any))
    .orderBy(desc(syncConflicts.createdAt))
    .limit(limit);
  res.json({ conflicts: rows });
});

/**
 * POST /api/sync/conflicts/:id/resolve — mark a conflict manually resolved.
 * Body: { decision: 'apply-source' | 'apply-target' | 'skip', resolvedBy?: string }.
 * Optionally re-arms the linked event for reprocessing. P08 records the resolution;
 * the actual re-apply against an EHR is P09.
 */
router.post('/sync/conflicts/:id/resolve', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const decision = req.body?.decision;
  if (!['apply-source', 'apply-target', 'skip'].includes(decision)) {
    res.status(400).json({ error: 'decision must be apply-source | apply-target | skip' });
    return;
  }
  const [existing] = await db
    .select()
    .from(syncConflicts)
    .where(and(eq(syncConflicts.id, id), eq(syncConflicts.resolution, 'pending')));
  if (!existing) {
    res.status(404).json({ error: 'pending conflict not found' });
    return;
  }
  await db
    .update(syncConflicts)
    .set({
      resolution: 'manual-resolved',
      resolvedBy: typeof req.body?.resolvedBy === 'string' ? req.body.resolvedBy : 'operator',
      resolvedAt: new Date(),
      diffJson: { ...(existing.diffJson as object | null), decision },
    })
    .where(eq(syncConflicts.id, id));
  log.info({ conflictId: id, decision }, 'conflict resolved');
  res.json({ status: 'manual-resolved', id, decision });
});

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 500);
}

// ---------------------------------------------------------------------------
// Sync control helpers
// ---------------------------------------------------------------------------

const MODE_ORDER: Record<string, number> = { off: 0, dry: 1, verify: 2, on: 3 };

/** Resolve env ceiling for a direction. Returns off|dry|on (verify treated as dry for UI). */
function envCeiling(direction: string, env: NodeJS.ProcessEnv = process.env): 'off' | 'dry' | 'on' {
  const raw = direction === 'drchrono_to_ghl'
    ? env.SYNC_WRITE_DRCHRONO_TO_GHL
    : env.SYNC_WRITE_GHL_TO_DRCHRONO;
  if (raw === 'on') return 'on';
  if (raw === 'off') return 'off';
  // 'verify' or 'dry' → display as 'dry'
  return 'dry';
}

/** Min of two modes using MODE_ORDER (lower = safer). */
function minMode(a: string, b: string): 'off' | 'dry' | 'on' {
  const order = (m: string) => (m === 'verify' ? 2 : (MODE_ORDER[m] ?? 0));
  const result = order(a) <= order(b) ? a : b;
  if (result === 'on') return 'on';
  if (result === 'dry' || result === 'verify') return 'dry';
  return 'off';
}

const VALID_DIRECTIONS = ['drchrono_to_ghl', 'ghl_to_drchrono'] as const;
const VALID_ENTITIES = ['patients', 'appointments'] as const;
const VALID_MODES = ['off', 'dry', 'on'] as const;

/** GET /api/sync/controls — return all 4 rows + computed env_ceiling + effective_mode. */
router.get('/sync/controls', async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(syncControls);
    const controls = rows.map((r) => {
      const ceiling = envCeiling(r.direction);
      const effective = minMode(r.mode, ceiling);
      return { ...r, env_ceiling: ceiling, effective_mode: effective };
    });
    res.json({ controls });
  } catch (err) {
    log.error({ err }, 'GET /sync/controls failed');
    res.status(500).json({ error: 'internal error' });
  }
});

/** PATCH /api/sync/controls/:direction/:entity — update toggle mode. */
router.patch('/sync/controls/:direction/:entity', async (req: Request, res: Response) => {
  const direction = String(req.params.direction);
  const entity = String(req.params.entity);

  if (!(VALID_DIRECTIONS as readonly string[]).includes(direction)) {
    res.status(400).json({ error: 'invalid direction' });
    return;
  }
  if (!(VALID_ENTITIES as readonly string[]).includes(entity)) {
    res.status(400).json({ error: 'invalid entity' });
    return;
  }

  const mode = req.body?.mode;
  if (!(VALID_MODES as readonly string[]).includes(mode)) {
    res.status(400).json({ error: 'mode must be off|dry|on' });
    return;
  }

  const ceiling = envCeiling(direction);
  if (MODE_ORDER[mode] > MODE_ORDER[ceiling]) {
    res.status(409).json({ error: 'exceeds env ceiling', effective: ceiling });
    return;
  }

  const updatedBy = (req as any).payload?.location ?? 'admin';
  try {
    const [updated] = await db
      .update(syncControls)
      .set({ mode: mode as 'off' | 'dry' | 'on', updatedAt: new Date(), updatedBy })
      .where(
        and(
          eq(syncControls.direction, direction as 'drchrono_to_ghl' | 'ghl_to_drchrono'),
          eq(syncControls.entity, entity as 'patients' | 'appointments'),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'row not found' });
      return;
    }

    // Notify cache listeners to invalidate
    await db.execute(sql`SELECT pg_notify('sync_controls_changed', ${direction + ':' + entity})`);

    const effective = minMode(updated.mode, ceiling);
    res.json({ ...updated, env_ceiling: ceiling, effective_mode: effective });
  } catch (err) {
    log.error({ err }, 'PATCH /sync/controls failed');
    res.status(500).json({ error: 'internal error' });
  }
});

// ---------------------------------------------------------------------------
// SSE activity stream
// ---------------------------------------------------------------------------

/** GET /api/sync/activity/stream — server-sent events for live sync activity. */
router.get('/sync/activity/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastSeenAt = new Date();

  // Send initial snapshot of last 50 events
  try {
    const snapshot = await db
      .select()
      .from(syncEvents)
      .orderBy(desc(syncEvents.receivedAt))
      .limit(50);
    if (!res.writableEnded) {
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    }
    if (snapshot.length > 0) {
      lastSeenAt = new Date(snapshot[0].receivedAt);
    }
  } catch (err) {
    log.warn({ err }, 'SSE snapshot failed');
  }

  const interval = setInterval(async () => {
    if (res.writableEnded) {
      clearInterval(interval);
      return;
    }
    try {
      const newRows = await db
        .select()
        .from(syncEvents)
        .where(
          // receivedAt > lastSeenAt
          sql`${syncEvents.receivedAt} > ${lastSeenAt.toISOString()}`,
        )
        .orderBy(syncEvents.receivedAt)
        .limit(20);
      if (newRows.length > 0) {
        lastSeenAt = new Date(newRows[newRows.length - 1].receivedAt);
        if (!res.writableEnded) {
          res.write(`event: update\ndata: ${JSON.stringify(newRows)}\n\n`);
        }
      }
    } catch (err) {
      log.warn({ err }, 'SSE poll failed — continuing');
    }
  }, 2000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

export default router;
