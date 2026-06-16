import { Router } from 'express';
import { drChronoController } from './controller.js';
import { drchronoSyncWebhook } from './webhook.js';

const router = Router();

// Webhook verification challenge -- DrChrono sends GET ?msg=<token>, expects
// { secret_token: HMAC_SHA256(msg, secret) }. Same handler serves both callback paths.
router.get('/webhook/drchrono', drChronoController.verifyWebhook);
router.get('/webhook/drchrono/sync', drChronoController.verifyWebhook);

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

// One-time backfill of all existing patients into GHL (allowlist-gated)
router.post('/drchrono/backfill-patients', drChronoController.triggerBackfill);

// BIDI-03: onboard GHL service calendars from DrChrono profiles (allowlist-gated)
router.post('/drchrono/onboard-calendars', drChronoController.triggerOnboardCalendars);

export default router;
