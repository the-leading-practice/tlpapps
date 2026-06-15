import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  drChronoConfigService,
  drChronoAuth,
  drChronoAPIClient,
  patientServiceClient,
  mapPatient,
  buildLocationHeaders,
  syncPatientsAndAppointments,
  runFullPoll,
  backfillPatients,
} from './services.js';
import { drchronoVerifyToken } from './webhook.js';
import { config } from '../../config.js';
import type {
  DrChronoWebhookPayload,
  DrChronoAppointment,
  DrChronoPatient,
  DrChronoConfigLocation,
} from './types.js';

const OAUTH_REDIRECT_URI = config.drchrono.oauthRedirectUri;
const DRCHRONO_API = config.drchrono.apiUrl;

const APPOINTMENT_EVENTS = new Set(['APPOINTMENT_CREATE', 'APPOINTMENT_MODIFY']);
const PATIENT_EVENTS = new Set(['PATIENT_CREATE', 'PATIENT_MODIFY']);

const createDrChronoController = () => {
  // ---------------------------------------------------------------------------
  // Webhook handler
  // ---------------------------------------------------------------------------

  const handleWebhook = async (req: Request, res: Response) => {
    const payload = req.body as DrChronoWebhookPayload;

    if (!payload?.action || !payload?.doctor) {
      res.status(400).send('invalid payload');
      return;
    }

    console.log(`webhook received: ${payload.action} for doctor ${payload.doctor}`);

    const statusCode = await _handleEvent(payload);
    res.status(statusCode).send();
  };

  const _handleEvent = async (payload: DrChronoWebhookPayload): Promise<number> => {
    const cfg = await drChronoConfigService.getConfig();
    if (!cfg) {
      console.error('webhook: no config found');
      return 500;
    }

    // Verify the secret token matches what we set in the DrChrono dashboard
    if (payload.secret_token !== cfg.webhookSecret) {
      console.error('webhook: invalid secret_token');
      return 403;
    }

    // Find which location this event belongs to based on the doctor ID
    const location = (cfg.locations as any[]).find(
      (l: any) => l.doctorId === payload.doctor,
    ) as DrChronoConfigLocation | undefined;

    if (!location) {
      console.warn(`webhook: no location found for doctor ${payload.doctor} -- skipping`);
      return 200;
    }

    const tokenResp = await drChronoAuth.getValidToken(
      location.name,
      cfg.clientId,
      cfg.clientSecret,
      location.accessToken,
      location.refreshToken,
      location.tokenExpiry,
    );

    if (tokenResp.status !== 200 || !tokenResp.accessToken) {
      console.error(`webhook: token refresh failed for ${location.name}`);
      return 500;
    }

    const client = drChronoAPIClient(tokenResp.accessToken);
    const locationHeaders = buildLocationHeaders(location);

    if (APPOINTMENT_EVENTS.has(payload.action)) {
      const appt = payload.object as DrChronoAppointment;
      await syncPatientsAndAppointments(client, [appt], location, locationHeaders);
    } else if (PATIENT_EVENTS.has(payload.action)) {
      const patient = mapPatient(payload.object as DrChronoPatient, location.timezone);
      await patientServiceClient.sendPatients([patient], locationHeaders);
    } else if (payload.action === 'APPOINTMENT_DELETE') {
      // Patient service doesn't support appointment deletion yet -- log and skip
      console.log(
        `webhook: APPOINTMENT_DELETE for appt ${(payload.object as DrChronoAppointment).id} -- no-op`,
      );
    }

    return 200;
  };

  // ---------------------------------------------------------------------------
  // Webhook verification challenge (DrChrono GET ?msg=...)
  // ---------------------------------------------------------------------------

  const verifyWebhook = async (req: Request, res: Response) => {
    const msg = req.query.msg as string | undefined;
    if (!msg) {
      res.status(400).send('missing ?msg= query param');
      return;
    }
    const cfg = await drChronoConfigService.getConfig();
    const secret = cfg?.webhookSecret || process.env.DRCHRONO_WEBHOOK_SECRET;
    if (!secret) {
      res.status(500).send('no webhook secret configured');
      return;
    }
    res.status(200).json({ secret_token: drchronoVerifyToken(msg, secret) });
  };

  // ---------------------------------------------------------------------------
  // OAuth flow
  // ---------------------------------------------------------------------------

  const oauthAuthorize = async (req: Request, res: Response) => {
    const locationName = req.query.location as string;
    if (!locationName) {
      res.status(400).send('missing ?location= query param');
      return;
    }

    const cfg = await drChronoConfigService.getConfig();
    if (!cfg) {
      res.status(500).send('no config in database');
      return;
    }

    const authUrl =
      `${DRCHRONO_API}/o/authorize/?response_type=code` +
      `&client_id=${encodeURIComponent(cfg.clientId)}` +
      `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
      `&state=${encodeURIComponent(locationName)}`;

    res.redirect(authUrl);
  };

  const oauthCallback = async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const locationName = req.query.state as string;

    if (!code || !locationName) {
      res.status(400).send('missing code or state');
      return;
    }

    const cfg = await drChronoConfigService.getConfig();
    if (!cfg) {
      res.status(500).send('no config in database');
      return;
    }

    const tokenResp = await drChronoAuth.exchangeCode(
      code,
      cfg.clientId,
      cfg.clientSecret,
      OAUTH_REDIRECT_URI,
    );

    if (tokenResp.status >= 200 && tokenResp.status < 300) {
      const tokenData = tokenResp.data as any;
      const expiry = Date.now() + tokenData.expires_in * 1000;

      await drChronoConfigService.updateLocationTokens(
        locationName,
        tokenData.access_token,
        tokenData.refresh_token,
        expiry,
      );

      res.send(
        `OAuth complete for "${locationName}". Tokens stored. You can close this window.`,
      );
    } else {
      res.status(500).send(`Token exchange failed: ${tokenResp.data}`);
    }
  };

  // ---------------------------------------------------------------------------
  // On-demand poll
  // ---------------------------------------------------------------------------

  const triggerPoll = async (_req: Request, res: Response) => {
    res.status(202).json({ message: 'poll started' });
    await runFullPoll();
  };

  // One-time backfill of all existing patients into GHL (allowlist-gated).
  const triggerBackfill = async (_req: Request, res: Response) => {
    res.status(202).json({ message: 'backfill started' });
    await backfillPatients();
  };

  return {
    handleWebhook,
    verifyWebhook,
    oauthAuthorize,
    oauthCallback,
    triggerPoll,
    triggerBackfill,
  };
};

export const drChronoController = createDrChronoController();
