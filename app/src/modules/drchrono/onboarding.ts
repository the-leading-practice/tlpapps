/**
 * BIDI-03 — Onboarding: DrChrono appointment profiles → GHL service calendars.
 *
 * For each configured DrChrono location that is ALLOWLISTED (demo only), this:
 *   1. mints a fresh GHL token (mintTokenForLocation) for the location's ghlLocationId,
 *   2. fetches the location's DrChrono appointment profiles (read-only),
 *   3. lists existing GHL calendars,
 *   4. for each profile: maps to an existing GHL calendar by NAME, else creates one,
 *   5. persists profileCalendarMap { [profileId]: ghlCalendarId } onto the Mongo
 *      drChronoConfig.locations[i] subdoc.
 *
 * IDEMPOTENT: a re-run matches by calendar name first, so no duplicate calendars
 * are ever created.
 *
 * SAFETY: writes GHL calendars ONLY for allowlisted locations (demo
 * wP3Ynm3Z63rIC4zVAgXP). Non-allowlisted locations are skipped entirely. This
 * endpoint never touches a real practice. It is a GHL-calendar write only — it
 * does NOT enable any sync writers or flip any kill switch.
 */

import { logger } from '../../logger.js';
import { DrChronoConfigModel } from '../../models/drchronoConfig.js';
import { isLocationAllowed } from '../sync/writers/allowlist.js';
import { mintTokenForLocation } from '../identity/controller.js';
import { calendarService } from '../integration/services.js';
import {
  drChronoConfigService,
  drChronoAuth,
  drChronoAPIClient,
} from './services.js';
import type { DrChronoConfigLocation, DrChronoAppointmentProfile } from './types.js';

const log = logger.child({ module: 'drchrono-onboarding' });

/** Turn a profile name into a GHL-friendly slug. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'service'
  );
}

export interface LocationOnboardResult {
  location: string;
  ghlLocationId?: string;
  skipped?: string;
  created: { profileId: number; name: string; calendarId: string }[];
  mapped: { profileId: number; name: string; calendarId: string }[];
  profileCalendarMap: Record<string, string>;
}

export interface OnboardSummary {
  results: LocationOnboardResult[];
}

/**
 * Run the onboarding for every configured location. Allowlist-gated: only acts on
 * locations whose ghlLocationId passes isLocationAllowed (demo only).
 */
export async function onboardCalendars(): Promise<OnboardSummary> {
  const cfg = await drChronoConfigService.getConfig();
  const summary: OnboardSummary = { results: [] };

  if (!cfg) {
    log.error('onboard-calendars: no drchrono config found');
    return summary;
  }

  for (const loc of cfg.locations as unknown[]) {
    const location = loc as DrChronoConfigLocation;
    const ghlLocationId = location.ghlLocationId;
    const result: LocationOnboardResult = {
      location: location.name,
      ghlLocationId,
      created: [],
      mapped: [],
      profileCalendarMap: {},
    };

    // SAFETY gate — only allowlisted (demo) locations may receive GHL calendar writes.
    if (!ghlLocationId || !isLocationAllowed(ghlLocationId)) {
      result.skipped = 'not-allowlisted';
      log.info({ location: location.name, ghlLocationId }, 'onboard: skipped (not allowlisted)');
      summary.results.push(result);
      continue;
    }

    // 1. Mint a fresh GHL token for this location.
    let ghlToken: string;
    try {
      const mint = await mintTokenForLocation(ghlLocationId);
      ghlToken = mint.token;
    } catch (err) {
      result.skipped = 'ghl-token-unavailable';
      log.error({ location: location.name, err }, 'onboard: GHL token mint failed');
      summary.results.push(result);
      continue;
    }

    // 2. Get a valid DrChrono token + fetch this location's profiles (read-only).
    const tokenResp = await drChronoAuth.getValidToken(
      location.name,
      cfg.clientId,
      cfg.clientSecret,
      location.accessToken,
      location.refreshToken,
      location.tokenExpiry,
    );
    if (tokenResp.status !== 200 || !tokenResp.accessToken) {
      result.skipped = 'drchrono-token-unavailable';
      log.error({ location: location.name }, 'onboard: DrChrono token refresh failed');
      summary.results.push(result);
      continue;
    }

    const dc = drChronoAPIClient(tokenResp.accessToken);
    const profResp = await dc.getAppointmentProfiles(location.doctorId);
    if (profResp.status !== 200) {
      result.skipped = 'drchrono-profiles-failed';
      log.error(
        { location: location.name, status: profResp.status, data: profResp.data },
        'onboard: getAppointmentProfiles failed',
      );
      summary.results.push(result);
      continue;
    }
    const profiles = profResp.data as DrChronoAppointmentProfile[];

    // 3. List existing GHL calendars; index by lowercased name for idempotent match.
    const calResp = (await calendarService.listCalendars(ghlLocationId, ghlToken)) as {
      status: number;
      data: any;
    };
    if (calResp.status < 200 || calResp.status >= 300) {
      result.skipped = 'ghl-list-calendars-failed';
      log.error(
        { location: location.name, status: calResp.status, data: calResp.data },
        'onboard: listCalendars failed',
      );
      summary.results.push(result);
      continue;
    }
    const existing: any[] = calResp.data?.calendars ?? calResp.data ?? [];
    const byName = new Map<string, string>();
    for (const c of existing) {
      if (c?.name && c?.id) byName.set(String(c.name).toLowerCase(), String(c.id));
    }

    // Resolve a default team member once (only if we need to create + GHL requires it).
    let defaultUserId: string | undefined;
    const resolveDefaultUser = async (): Promise<string | undefined> => {
      if (defaultUserId !== undefined) return defaultUserId || undefined;
      try {
        const usersResp = (await calendarService.listUsers(ghlLocationId, ghlToken)) as {
          status: number;
          data: any;
        };
        const users: any[] = usersResp.data?.users ?? usersResp.data ?? [];
        defaultUserId = users[0]?.id ? String(users[0].id) : '';
      } catch {
        defaultUserId = '';
      }
      return defaultUserId || undefined;
    };

    // 4. Map or create one GHL calendar per profile.
    const map: Record<string, string> = {};
    for (const profile of profiles) {
      const key = String(profile.name).toLowerCase();
      const existingId = byName.get(key);
      if (existingId) {
        map[String(profile.id)] = existingId;
        result.mapped.push({ profileId: profile.id, name: profile.name, calendarId: existingId });
        continue;
      }

      const userId = await resolveDefaultUser();
      const payload = {
        locationId: ghlLocationId,
        name: profile.name,
        calendarType: 'event',
        slug: `${slugify(profile.name)}-${profile.id}`,
        ...(typeof profile.duration === 'number' ? { slotDuration: profile.duration } : {}),
        ...(profile.color ? { eventColor: profile.color } : {}),
        ...(userId ? { teamMembers: [{ userId }] } : {}),
      };

      const created = (await calendarService.createCalendar(payload, ghlToken)) as {
        status: number;
        data: any;
      };
      if (created.status < 200 || created.status >= 300) {
        log.error(
          { location: location.name, profile: profile.name, status: created.status, data: created.data },
          'onboard: createCalendar failed — leaving profile unmapped',
        );
        continue;
      }
      const newId = String(created.data?.calendar?.id ?? created.data?.id ?? '');
      if (!newId) {
        log.error({ location: location.name, profile: profile.name }, 'onboard: created calendar missing id');
        continue;
      }
      byName.set(key, newId); // prevent dup-create within the same run
      map[String(profile.id)] = newId;
      result.created.push({ profileId: profile.id, name: profile.name, calendarId: newId });
    }

    // 5. Persist profileCalendarMap onto the location subdoc.
    await DrChronoConfigModel.updateOne(
      { 'locations.name': location.name },
      { $set: { 'locations.$.profileCalendarMap': map } },
    );

    result.profileCalendarMap = map;
    log.info(
      { location: location.name, created: result.created.length, mapped: result.mapped.length },
      'onboard: location complete',
    );
    summary.results.push(result);
  }

  log.info({ locations: summary.results.length }, 'onboard-calendars: complete');
  return summary;
}
