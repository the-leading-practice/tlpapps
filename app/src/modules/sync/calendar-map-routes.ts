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
  CalendarMapProfile,
} from '../drchrono/types.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-calendar-map' });
const router = Router();

/** Short timeout for the live DrChrono profile fetch — never block the page on a rate-limited EHR. */
const PROFILE_FETCH_TIMEOUT_MS = 8000;

/** Find the drChronoConfig location subdoc whose ghlLocationId matches. */
function findLocation(
  cfg: any,
  ghlLocationId: string,
): DrChronoConfigLocation | undefined {
  const locations = (cfg?.locations ?? []) as DrChronoConfigLocation[];
  return locations.find((l) => l.ghlLocationId === ghlLocationId);
}

/** Reject the wrapped promise if it doesn't settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('drchrono profile fetch timed out')), ms),
    ),
  ]);
}

/**
 * Attempt a live DrChrono appointment-profile fetch (token + profiles) within a
 * short timeout. Returns the mapped profiles on success, or null on any failure
 * (token error, non-200, timeout, rate-limit) so callers can fall back to cache.
 */
async function fetchLiveProfiles(
  cfg: any,
  location: DrChronoConfigLocation,
): Promise<CalendarMapProfile[] | null> {
  try {
    return await withTimeout(
      (async () => {
        const tokenResp = await drChronoAuth.getValidToken(
          location.name,
          cfg.clientId,
          cfg.clientSecret,
          location.accessToken,
          location.refreshToken,
          location.tokenExpiry,
        );
        if (tokenResp.status !== 200 || !tokenResp.accessToken) {
          throw new Error('drchrono token unavailable');
        }
        const dc = drChronoAPIClient(tokenResp.accessToken);
        const profResp = await dc.getAppointmentProfiles(location.doctorId);
        if (profResp.status !== 200) {
          throw new Error(`drchrono profiles fetch failed (${profResp.status})`);
        }
        return (profResp.data as DrChronoAppointmentProfile[]).map((p) => ({
          id: p.id,
          name: p.name,
          duration: p.duration ?? null,
          color: p.color ?? null,
        }));
      })(),
      PROFILE_FETCH_TIMEOUT_MS,
    );
  } catch (err: any) {
    log.warn(
      { location: location.name, err: err?.message },
      'calendar-map: live DrChrono profile fetch failed — using cache',
    );
    return null;
  }
}

/** Persist the freshly-fetched profiles to the location subdoc as a cache. */
async function cacheProfiles(
  locationName: string,
  profiles: CalendarMapProfile[],
): Promise<void> {
  try {
    await DrChronoConfigModel.updateOne(
      { 'locations.name': locationName },
      {
        $set: {
          'locations.$.appointmentProfiles': profiles,
          'locations.$.appointmentProfilesFetchedAt': Date.now(),
        },
      },
    );
  } catch (err: any) {
    log.warn({ locationName, err: err?.message }, 'calendar-map: failed to cache profiles');
  }
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

    // 1. DrChrono appointment profiles (read-only). Resilient: a live fetch is
    //    attempted with a short timeout; on any failure/rate-limit we fall back
    //    to the cached profiles and flag the response stale — never 502 here.
    const live = await fetchLiveProfiles(cfg, location);
    let profiles: CalendarMapProfile[];
    let profilesStale = false;
    let profilesError: string | undefined;
    if (live) {
      profiles = live;
      await cacheProfiles(location.name, live); // refresh cache
    } else {
      profiles = (location.appointmentProfiles ?? []) as CalendarMapProfile[];
      profilesStale = true;
      if (profiles.length === 0) profilesError = 'drchrono unreachable and no cached profiles';
    }

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
      profilesStale,
      ...(profilesError ? { profilesError } : {}),
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

    // Resolve known profile ids to validate the submission. Try a live fetch
    // (short timeout); if DrChrono is rate-limited, fall back to the cached
    // profile-id set so saving still works. Only 502 if there is no cache.
    const live = await fetchLiveProfiles(cfg, location);
    if (live) await cacheProfiles(location.name, live);
    const source: CalendarMapProfile[] =
      live ?? ((location.appointmentProfiles ?? []) as CalendarMapProfile[]);
    if (!live && source.length === 0) {
      res.status(502).json({ error: 'drchrono profiles unavailable (no cache)' });
      return;
    }
    const knownProfileIds = new Set(source.map((p) => String(p.id)));

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

/**
 * GET /api/sync/locations
 * Returns the agency's configured locations (those with a ghlLocationId) for the
 * calendar-map selector dropdown. READ-ONLY.
 *   → [{ ghlLocationId, name }]
 */
router.get('/sync/locations', async (_req: Request, res: Response) => {
  try {
    const cfg = await drChronoConfigService.getConfig();
    const locations = ((cfg?.locations ?? []) as DrChronoConfigLocation[])
      .filter((l) => typeof l.ghlLocationId === 'string' && l.ghlLocationId.length > 0)
      .map((l) => ({ ghlLocationId: l.ghlLocationId as string, name: l.name }));
    res.json(locations);
  } catch (err) {
    log.error({ err }, 'GET /sync/locations failed');
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
