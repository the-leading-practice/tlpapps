/**
 * Calendar-map admin surface — mounted at `/api/sync` (auth required).
 *
 * Lets an operator map each DrChrono appointment profile to a GHL calendar for a
 * given practice (GHL location). The mapping lives as `profileCalendarMap`
 * (profileId(string) → GHL calendarId) on the location's drChronoConfig subdoc
 * and is consumed by the sync engine (services.ts buildLocationHeaders →
 * resolveCalendar).
 *
 *   GET  /api/sync/calendar-map?location=<ghlLocationId>
 *     → { profiles, calendars, profileCalendarMap }
 *   PUT  /api/sync/calendar-map  body { location, profileCalendarMap }
 *     → { profileCalendarMap }   (validated + persisted)
 *
 * READ-ONLY against DrChrono (profile fetch only). The only write is the Mongo
 * profileCalendarMap update — no EHR mutation, no kill-switch change.
 */

import { Router, type Request, type Response } from 'express';
import { DrChronoConfigModel } from '../../models/drchronoConfig.js';
import {
  drChronoConfigService,
  drChronoAuth,
  drChronoAPIClient,
} from '../drchrono/services.js';
import { calendarService } from '../integration/services.js';
import { mintTokenForLocation } from '../identity/controller.js';
import type {
  DrChronoConfigLocation,
  DrChronoAppointmentProfile,
} from '../drchrono/types.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-calendar-map' });
const router = Router();

/** Find the drChronoConfig location subdoc whose ghlLocationId matches. */
function findLocation(
  cfg: any,
  ghlLocationId: string,
): DrChronoConfigLocation | undefined {
  const locations = (cfg?.locations ?? []) as DrChronoConfigLocation[];
  return locations.find((l) => l.ghlLocationId === ghlLocationId);
}

/**
 * GET /api/sync/calendar-map?location=<ghlLocationId>
 * Returns the DrChrono appointment profiles, the location's GHL calendars, and
 * the currently-persisted profile→calendar map.
 */
router.get('/sync/calendar-map', async (req: Request, res: Response) => {
  const ghlLocationId =
    typeof req.query.location === 'string' ? req.query.location.trim() : '';
  if (!ghlLocationId) {
    res.status(400).json({ error: 'location query param required' });
    return;
  }

  try {
    const cfg = await drChronoConfigService.getConfig();
    if (!cfg) {
      res.status(404).json({ error: 'no drchrono config' });
      return;
    }
    const location = findLocation(cfg, ghlLocationId);
    if (!location) {
      res.status(404).json({ error: 'unknown location' });
      return;
    }

    // 1. Fresh DrChrono token → appointment profiles (read-only).
    const tokenResp = await drChronoAuth.getValidToken(
      location.name,
      cfg.clientId,
      cfg.clientSecret,
      location.accessToken,
      location.refreshToken,
      location.tokenExpiry,
    );
    if (tokenResp.status !== 200 || !tokenResp.accessToken) {
      res.status(502).json({ error: 'drchrono token unavailable' });
      return;
    }
    const dc = drChronoAPIClient(tokenResp.accessToken);
    const profResp = await dc.getAppointmentProfiles(location.doctorId);
    if (profResp.status !== 200) {
      res.status(502).json({ error: 'drchrono profiles fetch failed' });
      return;
    }
    const profiles = (profResp.data as DrChronoAppointmentProfile[]).map((p) => ({
      id: p.id,
      name: p.name,
      duration: p.duration ?? null,
      color: p.color ?? null,
    }));

    // 2. GHL calendars for the location (minted location token).
    let ghlToken: string;
    try {
      const mint = await mintTokenForLocation(ghlLocationId);
      ghlToken = mint.ghlAccessToken;
    } catch (err: any) {
      log.error({ ghlLocationId, err: err?.message }, 'calendar-map: GHL token mint failed');
      res.status(502).json({ error: 'ghl token unavailable' });
      return;
    }
    const calResp = (await calendarService.listCalendars(ghlLocationId, ghlToken)) as {
      status: number;
      data: any;
    };
    if (calResp.status < 200 || calResp.status >= 300) {
      res.status(502).json({ error: 'ghl calendars fetch failed' });
      return;
    }
    const rawCalendars: any[] = calResp.data?.calendars ?? calResp.data ?? [];
    const calendars = rawCalendars.map((c) => ({
      id: String(c.id),
      name: c.name ?? '',
      calendarType: c.calendarType ?? null,
      isActive: c.isActive ?? null,
    }));

    res.json({
      profiles,
      calendars,
      profileCalendarMap: location.profileCalendarMap ?? {},
    });
  } catch (err) {
    log.error({ err, ghlLocationId }, 'GET /sync/calendar-map failed');
    res.status(500).json({ error: 'internal error' });
  }
});

/**
 * PUT /api/sync/calendar-map
 * Body: { location: ghlLocationId, profileCalendarMap: { [profileId]: calendarId } }
 * Validates that every calendarId belongs to the location's GHL calendars and
 * every profileId is a known DrChrono profile, then persists the map.
 */
router.put('/sync/calendar-map', async (req: Request, res: Response) => {
  const ghlLocationId =
    typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  const incoming = req.body?.profileCalendarMap;

  if (!ghlLocationId) {
    res.status(400).json({ error: 'location required' });
    return;
  }
  if (incoming == null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    res.status(400).json({ error: 'profileCalendarMap must be an object' });
    return;
  }

  try {
    const cfg = await drChronoConfigService.getConfig();
    if (!cfg) {
      res.status(404).json({ error: 'no drchrono config' });
      return;
    }
    const location = findLocation(cfg, ghlLocationId);
    if (!location) {
      // Guard: never write to a location without a config entry.
      res.status(404).json({ error: 'unknown location' });
      return;
    }

    // Resolve known profile ids + valid calendar ids to validate the submission.
    const tokenResp = await drChronoAuth.getValidToken(
      location.name,
      cfg.clientId,
      cfg.clientSecret,
      location.accessToken,
      location.refreshToken,
      location.tokenExpiry,
    );
    if (tokenResp.status !== 200 || !tokenResp.accessToken) {
      res.status(502).json({ error: 'drchrono token unavailable' });
      return;
    }
    const dc = drChronoAPIClient(tokenResp.accessToken);
    const profResp = await dc.getAppointmentProfiles(location.doctorId);
    if (profResp.status !== 200) {
      res.status(502).json({ error: 'drchrono profiles fetch failed' });
      return;
    }
    const knownProfileIds = new Set(
      (profResp.data as DrChronoAppointmentProfile[]).map((p) => String(p.id)),
    );

    let ghlToken: string;
    try {
      const mint = await mintTokenForLocation(ghlLocationId);
      ghlToken = mint.ghlAccessToken;
    } catch {
      res.status(502).json({ error: 'ghl token unavailable' });
      return;
    }
    const calResp = (await calendarService.listCalendars(ghlLocationId, ghlToken)) as {
      status: number;
      data: any;
    };
    if (calResp.status < 200 || calResp.status >= 300) {
      res.status(502).json({ error: 'ghl calendars fetch failed' });
      return;
    }
    const rawCalendars: any[] = calResp.data?.calendars ?? calResp.data ?? [];
    const validCalendarIds = new Set(rawCalendars.map((c) => String(c.id)));

    // Build a clean map: drop empty values (unassign), reject unknown ids.
    const clean: Record<string, string> = {};
    for (const [profileId, calendarId] of Object.entries(incoming)) {
      if (calendarId == null || calendarId === '') continue; // unmapped
      if (typeof calendarId !== 'string') {
        res.status(400).json({ error: `calendarId for profile ${profileId} must be a string` });
        return;
      }
      if (!knownProfileIds.has(String(profileId))) {
        res.status(400).json({ error: `unknown profile id: ${profileId}` });
        return;
      }
      if (!validCalendarIds.has(calendarId)) {
        res.status(400).json({ error: `calendarId ${calendarId} not in location calendars` });
        return;
      }
      clean[String(profileId)] = calendarId;
    }

    await DrChronoConfigModel.updateOne(
      { 'locations.name': location.name },
      { $set: { 'locations.$.profileCalendarMap': clean } },
    );

    log.info(
      { ghlLocationId, location: location.name, mapped: Object.keys(clean).length },
      'calendar-map: saved',
    );
    res.json({ profileCalendarMap: clean });
  } catch (err) {
    log.error({ err, ghlLocationId }, 'PUT /sync/calendar-map failed');
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
