import { Router } from 'express';
import { webhookController } from './controller.js';
import { ghlSignatureMiddleware } from './verify-ghl-signature.js';
import { ghlSyncWebhook } from './ghl.js';

const router = Router();

// P09: signed GHL webhook receiver that persists to sync_events for the DrChrono<->GHL
// engine. HMAC-verified before the handler runs (401 on mismatch).
router.post('/webhook/ghl/sync', ghlSignatureMiddleware, ghlSyncWebhook);

router.post('/webhook', webhookController.hook);
router.post('/webhook/appointment-create', webhookController.appointmentCreate);
router.post('/webhook/echo', webhookController.index);
router.get('/webhook/sample', webhookController.sample);

export default router;
