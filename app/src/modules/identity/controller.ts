import express from 'express';
import jwt from 'jsonwebtoken';
import { HighLevel } from '@gohighlevel/api-client';
import { config } from '../../config.js';
import { cryptoService } from '../../utils/crypto.js';
import { accessTokenService, appConfigService, ghlTokenService } from './services.js';
import type { AccessToken, Token } from './types.js';
import { decryptCrmSso } from '../../utils/crmSso.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'identity-crm-sso' });

// ---------------------------------------------------------------------------
// mintTokenForLocation
// ---------------------------------------------------------------------------
// Shared JWT-mint helper: looks up the accessTokens record for a location,
// decrypts the stored GHL access_token, and signs a JWT in the exact payload
// shape that authToken (middleware/auth.ts) requires.
//
// Auto-refreshes the stored GHL access_token via ensureFreshAccessToken when it
// is missing/expired/near expiry, persisting the rotated blob — so the sync
// engine, webhooks, and SSO never push with a dead token.
//
// Returns { token: <signed JWT>, config: <appConfig.config> } on success.
// Throws with a coded error on failure so callers can map to HTTP status codes:
//   'location_not_onboarded' — no accessTokens row for this location
//   'token_unavailable'      — stored token decrypt / parse failed
// ---------------------------------------------------------------------------

export interface MintResult {
  token: string;
  config: unknown;
  location: string;
  name: string;
}

// Refresh the access token this many ms BEFORE its stored expiry (safety margin
// for clock skew + in-flight requests). GHL access tokens live ~24h.
const REFRESH_SKEW_MS = 10 * 60 * 1000; // 10 minutes

// Per-location in-flight refresh promises — collapses concurrent mint calls
// (cron + webhook + SSO) into a single GHL refresh round-trip, avoiding a
// refresh-token rotation race (GHL rotates the refresh_token on every use).
const inFlightRefresh = new Map<string, Promise<string>>();

// ---------------------------------------------------------------------------
// ensureFreshAccessToken
// ---------------------------------------------------------------------------
// Returns a valid GHL access_token for a location, transparently refreshing it
// via the stored refresh_token when the current one is missing/expired/near
// expiry. Persists the rotated token blob + new expiresAt back to Mongo so the
// refresh only happens once per token lifetime (not per call). Fail-soft: if
// the refresh call errors but we still hold a decryptable access_token, return
// it (the caller's own GHL request will surface a hard 401 if it's truly dead).
// ---------------------------------------------------------------------------
export async function ensureFreshAccessToken(record: any): Promise<string> {
  const location: string = record.location;

  let parsed: Token;
  try {
    parsed = JSON.parse(cryptoService.decrypt(Buffer.from(record.token, 'hex')));
  } catch {
    const err = new Error(`Failed to decrypt/parse stored GHL token for location: ${location}`);
    (err as any).code = 'token_unavailable';
    throw err;
  }

  const expiresAt: number | undefined = record.get('expiresAt');
  const fresh = typeof expiresAt === 'number' && Date.now() < expiresAt - REFRESH_SKEW_MS;
  if (fresh) return parsed.access_token;

  // Stale / unknown expiry — refresh (deduped per location).
  const existing = inFlightRefresh.get(location);
  if (existing) return existing;

  const p = (async (): Promise<string> => {
    try {
      const resp = await ghlTokenService.renewAuthToken(parsed.refresh_token);
      if (resp.status >= 400 || !resp?.data?.access_token) {
        log.error(
          { location, status: resp.status, body: resp.data },
          'GHL token refresh failed — refresh_token may be dead (invalid_grant); re-authorize the GHL app for this location',
        );
        const err = new Error(`GHL token refresh failed for location ${location}: status=${resp.status}`);
        (err as any).code = 'ghl_refresh_failed';
        throw err;
      }
      const newBlob: Token = resp.data;
      record.token = cryptoService.encrypt(JSON.stringify(newBlob));
      const ttlSec = typeof newBlob.expires_in === 'number' ? newBlob.expires_in : 86400;
      record.set('expiresAt', Date.now() + ttlSec * 1000);
      await record.save();
      log.info({ location }, 'GHL access token auto-refreshed');
      return newBlob.access_token;
    } catch (e: any) {
      log.warn({ location, err: e?.message }, 'GHL token refresh threw; using existing token');
      return parsed.access_token; // fail-soft
    } finally {
      inFlightRefresh.delete(location);
    }
  })();

  inFlightRefresh.set(location, p);
  return p;
}

export async function mintTokenForLocation(location: string): Promise<MintResult> {
  const record = await accessTokenService.getTokenByLocation(location);
  if (!record || !record.token) {
    const err = new Error(`No accessTokens record for location: ${location}`);
    (err as any).code = 'location_not_onboarded';
    throw err;
  }

  const accessTokenStr = await ensureFreshAccessToken(record);

  // Fill timezone if empty (same guard as /api/login and /api/auth)
  let timezone = record.timezone || '';
  if (!timezone) {
    try {
      const locationData = await ghlTokenService.getLocationData(location, accessTokenStr);
      timezone = locationData.data.location.timezone || '';
    } catch {
      // Non-fatal — proceed with empty timezone
    }
  }

  const webToken = jwt.sign(
    {
      location: record.location,
      calendar: record.calendar,
      timezone,
      name: record.name,
      token: accessTokenStr,
      pushGHL: record.pushGHL ?? false,
      pushAppt: record.pushAppt ?? false,
      pushPat: record.pushPat ?? false,
      software: record.software,
    },
    config.tokenKey,
    { expiresIn: '86400s' },
  );

  const conf = await appConfigService.getConfig(location);

  return {
    token: webToken,
    config: conf ? conf.config : null,
    location: record.location,
    name: record.name,
  };
}

const createController = () => {
  const index = async (req: any, res: express.Response) => {
    res.status(200).json({ status: 'ok' });
  };

  const login = async (req: any, res: express.Response) => {
    const { location, secret } = req.body;
    console.log(`new login request`);
    console.log(req.body);

    const token = await accessTokenService.getToken(location, secret);

    if (token && token.token) {
      console.log(`token found for location ${location}`);

      const buf = Buffer.from(token.token, 'hex');
      const json = cryptoService.decrypt(buf);

      // renew token
      console.log(`renewing token - default action for phase 1`);
      const accessToken: Token = JSON.parse(json);
      const refToken = await ghlTokenService.renewAuthToken(accessToken.refresh_token);

      console.log(`access token: `);
      console.log(accessToken.access_token);

      console.log(`refresh token: `);
      console.log(refToken);

      if (refToken.status >= 400) {
        res.status(refToken.status).send(refToken.data);
        return;
      }

      let encToken = '';
      if (refToken.status > -1) {
        // check for timezone
        if (!token.timezone || token.timezone.length === 0) {
          token.timezone = '';

          console.log('grabbing location data');
          const locationData = await ghlTokenService.getLocationData(
            token.location,
            refToken.data.access_token,
          );
          token.timezone = locationData.data.location.timezone;
        }

        // encrypt the new token and store it
        console.log(`renew successfull - encrypting and storing`);
        encToken = cryptoService.encrypt(JSON.stringify(refToken.data));
      } else {
        // we had a network communication error with GHL
        // recycle the current token
        console.log(`communication error with GHL - recycling existing token`);
        encToken = token.token;
      }

      const updateToken: AccessToken = {
        company: token.company,
        location: location,
        name: token.name,
        calendar: token.calendar,
        timezone: token.timezone,
        secret: secret,
        token: encToken,
        pushGHL: token.pushGHL || false,
        pushAppt: token.pushAppt || false,
        pushPat: token.pushPat || false,
        software: token.software,
      };

      if (refToken.status > -1) {
        await accessTokenService.updateToken(updateToken);
      }

      // mint JWT via shared helper (reads refreshed record from DB)
      console.log(`minting jwt for location ${location}`);
      const minted = await mintTokenForLocation(location);
      res.status(200).json({ config: minted.config, token: minted.token });
      return;
    }

    res.sendStatus(403);
  };

  const auth = async (req: express.Request, res: express.Response) => {
    const { location, secret } = req.body;
    console.log(`new login request - auth`);
    console.log(req.body);

    const token = await accessTokenService.getToken(location, secret);

    if (token && token.token) {
      console.log(`token found for location ${location}`);

      const buf = Buffer.from(token.token, 'hex');
      const json = cryptoService.decrypt(buf);
      const accessToken: Token = JSON.parse(json);

      console.log(`access token: `);
      console.log(accessToken.access_token);

      console.log(`refresh token: `);
      console.log(accessToken.refresh_token);

      // mint JWT via shared helper (handles timezone fill + appConfig lookup)
      console.log(`minting jwt for location ${location}`);
      const minted = await mintTokenForLocation(location);
      res.status(200).json({ config: minted.config, token: minted.token });
      return;
    }

    res.sendStatus(403);
  };

  const oauth = async (req: express.Request, res: express.Response) => {
    console.log('GET to /oauth');

    // get code
    const ghlCode = req.query.code || '';
    if (typeof ghlCode === 'undefined' || ghlCode.length === 0) {
      res.sendStatus(400);
      return;
    }

    const hl = new HighLevel({ clientId: config.ghl.clientId, clientSecret: config.ghl.clientSecret });
    hl.oauth
      .getAccessToken({
        client_id: config.ghl.clientId,
        client_secret: config.ghl.clientSecret,
        grant_type: 'authorization_code',
        code: ghlCode as string,
        user_type: 'Location',
      })
      .then(async (msg: any) => {
        const token = msg;
        console.log(token);

        // encrypt token for long term storage
        const encToken = cryptoService.encrypt(JSON.stringify(msg));
        const secret = cryptoService.getNewSecret();

        if (token.companyId) {
          const existingToken = await accessTokenService.getTokenByCompany(token.companyId);

          console.log(existingToken);

          const company = token.companyId || 'waiting';
          const location = token.locationId || 'waiting';
          let name = existingToken ? existingToken.name : 'waiting';
          const calendar = existingToken ? existingToken.calendar : 'need-calendar-id';
          let timezone = existingToken ? existingToken.timezone : 'waiting';
          const pushGHL = existingToken && existingToken.pushGHL ? existingToken.pushGHL : false;
          const pushAppt = existingToken && existingToken.pushAppt ? existingToken.pushAppt : false;
          const pushPat = existingToken && existingToken.pushPat ? existingToken.pushPat : false;
          const software =
            existingToken && existingToken.software ? existingToken.software : 'unknown';

          if (!existingToken && token.locationId) {
            // we need to get the data for this practice
            const locationData = await ghlTokenService.getLocationData(
              token.locationId,
              token.access_token,
            );

            name = locationData.data.location.name;
            timezone = locationData.data.location.timezone;
          }

          if (timezone.length === 0 && token.locationId) {
            const locationData = await ghlTokenService.getLocationData(
              token.locationId,
              token.access_token,
            );
            timezone = locationData.data.location.timezone;
          }

          const updateToken: AccessToken = {
            company: company,
            location: location,
            name: name,
            calendar: calendar,
            timezone: timezone,
            secret: secret,
            token: encToken,
            pushGHL: pushGHL,
            pushAppt: pushAppt,
            pushPat: pushPat,
            software: software,
          };

          console.log('updating accessToken');
          console.log(updateToken);
          const access = await accessTokenService.updateToken(updateToken);

          // send response
          res.status(200);
          res.set('Content-Security-Policy', 'img-src https://media.theleadingpractice.com');
          res.json({
            locationId: access.location,
            locationSecret: access.secret,
          });
        }
      });
  };

  const locationAuth = async (req: express.Request, res: express.Response) => {
    res.status(200).json({ success: true });

    const data = { ...req.body };

    const hl = new HighLevel({ clientId: config.ghl.clientId, clientSecret: config.ghl.clientSecret });
    try {
      const hlRes = await hl.oauth.getLocationAccessToken({
        companyId: data.companyId,
        locationId: data.locationId,
      });

      const encToken = cryptoService.encrypt(JSON.stringify(hlRes));

      // update token in mongo
      const existingToken = await accessTokenService.getTokenByCompany(data.companyId);
      const updateToken: AccessToken = {
        company: data.companyId,
        location: data.locationId,
        name: data.companyName,
        calendar: 'need-calendar-id',
        timezone: '',
        secret: '',
        token: encToken,
        pushGHL: false,
        pushAppt: false,
        pushPat: false,
        software: 'unkown',
      };

      if (existingToken) {
        updateToken.calendar = existingToken.calendar;
        updateToken.name = existingToken.name;
        updateToken.timezone = existingToken.timezone;
        updateToken.secret = existingToken.timezone;
        updateToken.pushGHL = existingToken.pushGHL || false;
        updateToken.pushAppt = existingToken.pushAppt || false;
        updateToken.pushPat = existingToken.pushPat || false;
        updateToken.software = existingToken.software;

        if (updateToken.timezone.length === 0) {
          const locResp = await hl.locations.getLocation({ locationId: data.locationId });
          existingToken.timezone = locResp.location?.timezone || '';
        }

        await accessTokenService.updateToken(updateToken);
      }
    } catch (err) {
      console.log(`error getting location access${err}`);
    }
  };

  // -------------------------------------------------------------------------
  // EMBED-03a — POST /api/crm/sso
  // Decrypts the GHL SSO blob, derives the locationId, mints a TLP JWT.
  // Mounted UNAUTHENTICATED (same tier as /api/login).
  // -------------------------------------------------------------------------
  const ssoLogin = async (req: express.Request, res: express.Response): Promise<void> => {
    // 1. Validate input — never log raw ssoData.
    const { ssoData } = req.body as { ssoData?: unknown };
    if (!ssoData || typeof ssoData !== 'string' || ssoData.trim().length === 0) {
      res.status(400).json({ error: 'sso_missing_data' });
      return;
    }

    // 2. SSO key must be configured.
    if (!config.ghl.ssoKey) {
      log.warn('POST /api/crm/sso called but GHL_APP_SSO_KEY is not configured');
      res.status(503).json({ error: 'sso_not_configured' });
      return;
    }

    // 3. Decrypt the blob.
    let activeLocation: string;
    try {
      const payload = decryptCrmSso(ssoData, config.ghl.ssoKey);
      if (!payload.activeLocation) {
        res.status(400).json({ error: 'sso_no_location' });
        return;
      }
      activeLocation = payload.activeLocation;
      // Log safe context only — no raw ssoData, no PII values.
      log.info({ activeLocation }, 'SSO decrypt succeeded');
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'SSO decrypt failed');
      res.status(401).json({ error: 'sso_decrypt_failed' });
      return;
    }

    // 4. Mint JWT from the stored accessTokens record.
    try {
      const minted = await mintTokenForLocation(activeLocation);
      // Never log the minted token.
      log.info({ location: activeLocation, name: minted.name }, 'SSO login minted');
      res.status(200).json({
        token: minted.token,
        config: minted.config,
        location: minted.location,
        name: minted.name,
      });
    } catch (err: any) {
      if (err.code === 'location_not_onboarded') {
        res.status(409).json({ error: 'location_not_onboarded', location: activeLocation });
        return;
      }
      if (err.code === 'token_unavailable') {
        log.error({ err: err.message, location: activeLocation }, 'SSO: stored token unavailable');
        res.status(500).json({ error: 'token_unavailable' });
        return;
      }
      log.error({ err: err.message, location: activeLocation }, 'SSO: unexpected mint error');
      res.status(500).json({ error: 'internal_error' });
    }
  };

  // -------------------------------------------------------------------------
  // EMBED-03a — GET /api/crm/sso-status
  // Returns whether the SSO key is configured so the embed shell can surface
  // a helpful message if the owner hasn't set GHL_APP_SSO_KEY yet.
  // -------------------------------------------------------------------------
  const ssoStatus = (_req: express.Request, res: express.Response): void => {
    res.json({ configured: Boolean(config.ghl.ssoKey) });
  };

  return {
    index,
    login,
    auth,
    oauth,
    locationAuth,
    ssoLogin,
    ssoStatus,
  };
};

export const controller = createController();
