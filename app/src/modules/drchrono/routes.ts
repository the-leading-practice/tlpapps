import { Router } from 'express';
import { drChronoController } from './controller.js';
import { drchronoSyncWebhook } from './webhook.js';

const router = Router();

// Webhook receiver -- DrChrono pushes real-time events here
router.post('/webhook/drchrono', drChronoController.handleWebhook);

// P09: DrChrono webhook receiver that persists to sync_events for the engine.
// secret_token verified inside the handler (403 on mismatch).
router.post('/webhook/drchrono/sync', drchronoSyncWebhook);

// OAuth flow -- one-time setup per clinic location
router.get('/oauth/authorize', drChronoController.oauthAuthorize);
router.get('/oauth/callback', drChronoController.oauthCallback);

// On-demand poll trigger
router.post('/drchrono/poll', drChronoController.triggerPoll);

export default router;
