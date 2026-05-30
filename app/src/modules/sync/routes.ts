/**
 * P08 sync HTTP surface — mounted at `/api/sync` (auth required). Read views over
 * the sync event/conflict state plus operator actions (replay an event, resolve a
 * conflict). No EHR calls — replay just re-arms an event for the dry-run engine.
 */

import { Router, type Request, type Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { syncEvents, syncConflicts } from '../../db/pg/schema/sync.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-routes' });
const router = Router();

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

export default router;
