import { Router } from 'express';
import { webhookController } from './controller.js';
import { ghlSignatureMiddleware } from './verify-ghl-signature.js';
import { ghlSyncWebhook } from './ghl.js';
import { crmSyncWebhook } from './crm.js';

const router = Router();

// P09: signed GHL webhook receiver that persists to sync_events for the DrChrono<->GHL
// engine. HMAC-verified before the handler runs (401 on mismatch).
router.post('/webhook/ghl/sync', ghlSignatureMiddleware, ghlSyncWebhook);

// GHL CRM webhook receiver — handles events GHL posts to /api/webhook/crm/:resource/:action
// (e.g. contact/updated, contact/created, appointment/created …).  Signature handling is
// inside the handler so unsigned health-pings still get a 200 (prevents GHL auto-pause).
router.post('/webhook/crm/:resource/:action', crmSyncWebhook);

router.post('/webhook', webhookController.hook);
router.post('/webhook/appointment-create', webhookController.appointmentCreate);
router.post('/webhook/echo', webhookController.index);
router.get('/webhook/sample', webhookController.sample);

export default router;
