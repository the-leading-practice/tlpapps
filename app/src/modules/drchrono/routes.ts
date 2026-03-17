import { Router } from 'express';
import { drChronoController } from './controller.js';

const router = Router();

// Webhook receiver -- DrChrono pushes real-time events here
router.post('/webhook/drchrono', drChronoController.handleWebhook);

// OAuth flow -- one-time setup per clinic location
router.get('/oauth/authorize', drChronoController.oauthAuthorize);
router.get('/oauth/callback', drChronoController.oauthCallback);

// On-demand poll trigger
router.post('/drchrono/poll', drChronoController.triggerPoll);

export default router;
