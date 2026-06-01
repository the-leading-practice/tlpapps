/**
 * P05 verify mode — built-in capture sink endpoint.
 *
 * Mounted PUBLIC (before authMiddleware) so the engine's default sink target
 * (http://localhost:PORT/api/sync/verify-sink) works without an EHR/JWT token —
 * verify mode must function with no real credentials. These routes never call an
 * EHR; they only persist/return capture envelopes for human inspection.
 *
 * POST /api/sync/verify-sink — accept an envelope, insert a sync_verify_captures row.
 * GET  /api/sync/verify-sink?limit=N — most recent N captures (newest first, default 50).
 */

import { Router, type Request, type Response } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { syncVerifyCaptures } from '../../db/pg/schema/sync.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-verify-sink' });
const router = Router();

router.post('/sync/verify-sink', async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const [row] = await db
    .insert(syncVerifyCaptures)
    .values({
      direction: typeof body.direction === 'string' ? body.direction : null,
      eventId: typeof body.eventId === 'string' ? body.eventId : null,
      wouldHaveSent: (body.wouldHaveSent ?? null) as object | null,
    })
    .returning({ id: syncVerifyCaptures.id });
  log.info(
    { id: row?.id, direction: body.direction, eventId: body.eventId },
    'verify-sink captured outbound write',
  );
  res.status(200).json({ captured: true, id: row?.id });
});

router.get('/sync/verify-sink', async (req: Request, res: Response) => {
  const raw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
  const limit = !Number.isFinite(raw) || raw <= 0 ? 50 : Math.min(raw, 500);
  const rows = await db
    .select()
    .from(syncVerifyCaptures)
    .orderBy(desc(syncVerifyCaptures.capturedAt))
    .limit(limit);
  res.json({ captures: rows });
});

export default router;
