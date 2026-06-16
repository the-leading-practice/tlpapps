import { config } from '../../config.js';
import { writeModeForEntity } from '../sync/writers/dispatch.js';
import { isLocationAllowed } from '../sync/writers/allowlist.js';
import { tagFor } from '../sync/origin.js';
import { logger } from '../../logger.js';
import { DrChronoConfigModel } from '../../models/drchronoConfig.js';
import { mintTokenForLocation } from '../identity/controller.js';
import type {
  DrChronoTokenResponse,
  DrChronoPatient,
  DrChronoAppointment,
  DrChronoListResponse,
  DrChronoConfigLocation,
  DrChronoAppointmentProfile,
  TLPPatientPayload,
  TLPAppointmentPayload,
  LocationHeaders,
} from './types.js';

const DRCHRONO_API = config.drchrono.apiUrl;
const TLP_PATIENT_API = process.env.TLP_PATIENT_API || '';
const TOKEN_ENDPOINT = `${DRCHRONO_API}/o/token/`;

// ---------------------------------------------------------------------------
// DrChrono Config Service (MongoDB)
// ---------------------------------------------------------------------------

const createDrChronoConfigService = () => {
  const getConfig = async () => {
    const cfg = await DrChronoConfigModel.findOne({});
    return cfg;
  };

  const updateLocationTokens = async (
    locationName: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiry: number,
  ) => {
    await DrChronoConfigModel.updateOne(
      { 'locations.name': locationName },
      {
        $set: {
          'locations.$.accessToken': accessToken,
          'locations.$.refreshToken': refreshToken,
          'locations.$.tokenExpiry': tokenExpiry,
        },
      },
    );
  };

  return {
    getConfig,
    updateLocationTokens,
  };
};

export const drChronoConfigService = createDrChronoConfigService();

// ---------------------------------------------------------------------------
// DrChrono OAuth / Auth
// ---------------------------------------------------------------------------

const createDrChronoAuth = () => {
  /**
   * Exchange an authorization code for access + refresh tokens.
   * Called once per location during the initial OAuth setup flow.
   */
  const exchangeCode = async (
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) => {
    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (resp.status >= 200 && resp.status < 300) {
      const data = (await resp.json()) as DrChronoTokenResponse;
      return { status: resp.status, data };
    }
    return { status: resp.status, data: resp.statusText };
  };

  /**
   * Use a stored refresh_token to obtain a new access_token.
   * Persists updated tokens back to MongoDB.
   */
  const refreshAccessToken = async (
    locationName: string,
    clientId: string,
    clientSecret: string,
    storedRefreshToken: string,
  ) => {
    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: storedRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (resp.status >= 200 && resp.status < 300) {
      const data = (await resp.json()) as DrChronoTokenResponse;
      const expiry = Date.now() + data.expires_in * 1000;

      await drChronoConfigService.updateLocationTokens(
        locationName,
        data.access_token,
        data.refresh_token,
        expiry,
      );

      return { status: resp.status, data };
    }

    return { status: resp.status, data: resp.statusText };
  };

  /**
   * Returns a valid access token for a location, refreshing if within 5 minutes of expiry.
   */
  const getValidToken = async (
    locationName: string,
    clientId: string,
    clientSecret: string,
    accessToken: string,
    storedRefreshToken: string,
    tokenExpiry: number,
  ): Promise<{ status: number; accessToken: string }> => {
    const fiveMinutes = 5 * 60 * 1000;

    if (Date.now() < tokenExpiry - fiveMinutes) {
      return { status: 200, accessToken };
    }

    console.log(`refreshing token for ${locationName}`);
    const resp = await refreshAccessToken(locationName, clientId, clientSecret, storedRefreshToken);

    if (resp.status >= 200 && resp.status < 300) {
      const tokenData = resp.data as DrChronoTokenResponse;
      return { status: 200, accessToken: tokenData.access_token };
    }

    console.error(`token refresh failed for ${locationName}: ${resp.data}`);
    return { status: resp.status, accessToken: '' };
  };

  return {
    exchangeCode,
    refreshAccessToken,
    getValidToken,
  };
};

export const drChronoAuth = createDrChronoAuth();

// ---------------------------------------------------------------------------
// DrChrono API Client (per-request, token-scoped)
// ---------------------------------------------------------------------------

export const drChronoAPIClient = (token: string) => {
  const access_token = token;

  const processResp = async <T>(
    resp: Response,
  ): Promise<{ status: number; data: T | string }> => {
    if (resp.status >= 200 && resp.status < 300) {
      const data = (await resp.json()) as T;
      return { status: resp.status, data };
    }
    return { status: resp.status, data: resp.statusText };
  };

  const authHeaders = () => ({
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  });

  /**
   * Get appointments for a date range.
   * DrChrono expects date_range as "YYYY-MM-DD/YYYY-MM-DD"
   * Handles pagination automatically, returning all results.
   */
  const getAppointments = async (
    startDate: string,
    endDate: string,
  ): Promise<{ status: number; data: DrChronoAppointment[] | string }> => {
    const allAppointments: DrChronoAppointment[] = [];
    let url: string | null = `${DRCHRONO_API}/api/appointments?date_range=${startDate}%2F${endDate}`;

    while (url) {
      const resp = await fetch(url, { method: 'GET', headers: authHeaders() });
      const result = await processResp<DrChronoListResponse<DrChronoAppointment>>(resp);

      if (result.status < 200 || result.status >= 300) {
        return { status: result.status, data: result.data as string };
      }

      const page = result.data as DrChronoListResponse<DrChronoAppointment>;
      allAppointments.push(...page.results);
      url = page.next;
    }

    return { status: 200, data: allAppointments };
  };

  /**
   * Get a single patient by DrChrono patient ID.
   */
  const getPatient = async (
    patientId: number,
  ): Promise<{ status: number; data: DrChronoPatient | string }> => {
    const url = `${DRCHRONO_API}/api/patients/${patientId}`;
    const resp = await fetch(url, { method: 'GET', headers: authHeaders() });
    return processResp<DrChronoPatient>(resp);
  };

  /**
   * Get ALL patients for a doctor (paginated). Used by the one-time backfill so
   * existing patients are pulled into GHL regardless of whether they have an
   * appointment in the poll window.
   */
  const getAllPatients = async (
    doctorId?: number,
  ): Promise<{ status: number; data: DrChronoPatient[] | string }> => {
    const all: DrChronoPatient[] = [];
    let url: string | null = `${DRCHRONO_API}/api/patients${
      doctorId ? `?doctor=${doctorId}` : ''
    }`;

    while (url) {
      const resp = await fetch(url, { method: 'GET', headers: authHeaders() });
      const result = await processResp<DrChronoListResponse<DrChronoPatient>>(resp);

      if (result.status < 200 || result.status >= 300) {
        return { status: result.status, data: result.data as string };
      }

      const page = result.data as DrChronoListResponse<DrChronoPatient>;
      all.push(...page.results);
      url = page.next;
    }

    return { status: 200, data: all };
  };

  /**
   * Get ALL appointment profiles (paginated), optionally filtered by doctor.
   * Used by onboarding (BIDI-03) to provision one GHL service calendar per
   * DrChrono profile. READ-ONLY — never mutates DrChrono.
   */
  const getAppointmentProfiles = async (
    doctorId?: number,
  ): Promise<{ status: number; data: DrChronoAppointmentProfile[] | string }> => {
    const all: DrChronoAppointmentProfile[] = [];
    let url: string | null = `${DRCHRONO_API}/api/appointment_profiles${
      doctorId ? `?doctor=${doctorId}` : ''
    }`;

    while (url) {
      const resp = await fetch(url, { method: 'GET', headers: authHeaders() });
      const result = await processResp<DrChronoListResponse<DrChronoAppointmentProfile>>(resp);

      if (result.status < 200 || result.status >= 300) {
        return { status: result.status, data: result.data as string };
      }

      const page = result.data as DrChronoListResponse<DrChronoAppointmentProfile>;
      all.push(...page.results);
      url = page.next;
    }

    return { status: 200, data: all };
  };

  /**
   * BIDI-05 (REV-02) — create a DrChrono patient. Body must already be in DrChrono
   * shape (see `ghlContactToDrChronoPatient`). LIVE EHR WRITE — only ever reached
   * when the reverse writer is in `on` mode AND the location is allowlisted; the
   * default reverse WriteMode is off/dry so this is dormant.
   */
  const createPatient = async (
    patient: Record<string, unknown>,
  ): Promise<{ status: number; data: DrChronoPatient | string }> => {
    const resp = await fetch(`${DRCHRONO_API}/api/patients`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(patient),
    });
    return processResp<DrChronoPatient>(resp);
  };

  /**
   * BIDI-05 (REV-03/04) — create a DrChrono appointment. Body must already be in
   * DrChrono shape (see `ghlAppointmentToDrChrono`). LIVE EHR WRITE — dormant
   * unless reverse writer is `on` + allowlisted.
   */
  const createAppointment = async (
    appt: Record<string, unknown>,
  ): Promise<{ status: number; data: DrChronoAppointment | string }> => {
    const resp = await fetch(`${DRCHRONO_API}/api/appointments`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(appt),
    });
    return processResp<DrChronoAppointment>(resp);
  };

  return {
    getAppointments,
    getPatient,
    getAllPatients,
    getAppointmentProfiles,
    createPatient,
    createAppointment,
  };
};

// ---------------------------------------------------------------------------
// BIDI-05 reverse mappers: GHL contact/appointment → DrChrono create bodies.
// Pure functions — no I/O. Used by the reverse (ghl_to_drchrono) writer path.
// ---------------------------------------------------------------------------

/** Map a GHL contact payload to a DrChrono patient create body. */
export const ghlContactToDrChronoPatient = (
  contact: Record<string, any>,
  doctorId: number,
): Record<string, unknown> => ({
  doctor: doctorId,
  first_name: contact.firstName ?? contact.first_name ?? '',
  last_name: contact.lastName ?? contact.last_name ?? '',
  ...(contact.email ? { email: contact.email } : {}),
  ...(contact.phone ? { cell_phone: contact.phone } : {}),
  ...(contact.dateOfBirth || contact.date_of_birth
    ? { date_of_birth: contact.dateOfBirth ?? contact.date_of_birth }
    : {}),
});

/** Map a GHL appointment payload to a DrChrono appointment create body. */
export const ghlAppointmentToDrChrono = (
  appt: Record<string, any>,
  opts: { doctorId: number; officeId?: number; patientId?: number },
): Record<string, unknown> => ({
  doctor: opts.doctorId,
  ...(opts.officeId ? { office: opts.officeId } : {}),
  ...(opts.patientId ? { patient: opts.patientId } : {}),
  scheduled_time: appt.startTime ?? appt.scheduled_time,
  ...(typeof appt.duration === 'number' ? { duration: appt.duration } : {}),
  status: appt.appointmentStatus ?? appt.status ?? '',
  ...(appt.title || appt.reason ? { reason: appt.title ?? appt.reason } : {}),
});

// ---------------------------------------------------------------------------
// Patient Service Client (sends data to TLP patient-service)
// ---------------------------------------------------------------------------

const dcLog = logger.child({ module: 'drchrono-service-client' });

export type PatientServiceClientDeps = {
  /** Override writeModeForEntity — for unit tests only. */
  getModePatients?: () => Promise<import('../sync/writers/dispatch.js').WriteMode>;
  getModeAppointments?: () => Promise<import('../sync/writers/dispatch.js').WriteMode>;
  /** Override isLocationAllowed — for unit tests only. */
  checkAllowlist?: (id: string) => boolean;
  /** Override the HTTP fetch function — for unit tests only. */
  httpFetch?: typeof fetch;
};

export const createPatientServiceClient = (deps: PatientServiceClientDeps = {}) => {
  const resolveMode = deps.getModePatients ?? (() =>
    writeModeForEntity('drchrono_to_ghl', 'patients').catch(() => 'off' as const));
  const resolveModeAppt = deps.getModeAppointments ?? (() =>
    writeModeForEntity('drchrono_to_ghl', 'appointments').catch(() => 'off' as const));
  const checkAllowlist = deps.checkAllowlist ?? isLocationAllowed;
  const httpFetch = deps.httpFetch ?? fetch;

  const sendPatients = async (patients: TLPPatientPayload[], headers: LocationHeaders) => {
    const tlpLocationId = headers.tlpLocation;
    // Use the GHL location ID for allowlist checks — the allowlist is keyed on GHL IDs,
    // not TLP location IDs.  If ghlLocationId is absent we cannot verify the ID space,
    // so fail closed (skip the write) rather than fall through.
    const ghlLocationId = headers.ghlLocationId;

    // Toggle guard: check sync_controls mode for drchrono→ghl/patients direction.
    const mode = await resolveMode();
    if (mode === 'off') {
      dcLog.info({ tlpLocationId }, 'sendPatients skipped — sync_controls mode=off');
      return { status: 200, data: { skipped: true, reason: 'mode-off' } };
    }

    // Allowlist guard: check GHL location ID namespace.  Fail closed if GHL ID unavailable.
    if (!ghlLocationId) {
      dcLog.error({ tlpLocationId }, 'sendPatients blocked — ghlLocationId not set; cannot verify allowlist (fail-closed)');
      return { status: 200, data: { skipped: true, reason: 'allowlist-blocked' } };
    }
    if (!checkAllowlist(ghlLocationId)) {
      dcLog.error({ ghlLocationId, tlpLocationId }, 'sendPatients blocked — location not in allowlist');
      return { status: 200, data: { skipped: true, reason: 'allowlist-blocked' } };
    }

    if (mode === 'dry') {
      dcLog.info({ tlpLocationId, count: patients.length }, 'sendPatients dry-run — would send patients (no call)');
      return { status: 200, data: { skipped: true, reason: 'mode-dry' } };
    }

    // verify mode: capture intent only — no live write (fail-closed like dry).
    if (mode === 'verify') {
      dcLog.info({ tlpLocationId, count: patients.length }, 'sendPatients verify — captured intent, no live write');
      return { status: 200, data: { skipped: true, reason: 'mode-verify' } };
    }

    const url = `${TLP_PATIENT_API}/patient`;

    // Self-call to /api/patient is authToken-protected; authToken reads ONLY the
    // Authorization: Bearer header. Mint a fresh location JWT (stored tlpJwt is stale).
    let authJwt: string;
    let ghlAccessToken: string;
    try {
      const minted = await mintTokenForLocation(ghlLocationId);
      authJwt = minted.token;
      ghlAccessToken = minted.ghlAccessToken;
    } catch (e: any) {
      dcLog.error({ ghlLocationId, err: e?.message }, 'sendPatients: mintTokenForLocation failed — GHL token may need re-authorization');
      return { status: 401, data: { error: 'no_valid_jwt', reason: e?.message } };
    }

    // The patient controller pushes to GHL using the raw access_token from the
    // x-tlp-app-jwt header and the contact's own locationId — populate both with
    // fresh values (the stored headers.tlpJwt is stale and patients carry no GHL id).
    const ghlPatients = patients.map((p) => ({ ...p, locationId: ghlLocationId }));

    const resp = await httpFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authJwt}`,
        'x-tlp-app-location': `${headers.tlpLocation} ${headers.tlpToken}`,
        'x-tlp-app-timezone': headers.timezone,
        'x-tlp-app-jwt': ghlAccessToken,
        'x-tlp-app-pushghl': '1',
        'x-tlp-app-pushpat': '1',
      },
      body: JSON.stringify({ patients: ghlPatients }),
    });

    if (resp.status >= 200 && resp.status < 300) {
      const data = await resp.json();
      return { status: resp.status, data };
    }
    return { status: resp.status, data: resp.statusText };
  };

  const sendAppointments = async (
    appointments: TLPAppointmentPayload[],
    headers: LocationHeaders,
  ) => {
    const tlpLocationId = headers.tlpLocation;
    // Use the GHL location ID for allowlist checks — the allowlist is keyed on GHL IDs,
    // not TLP location IDs.  If ghlLocationId is absent we cannot verify the ID space,
    // so fail closed (skip the write) rather than fall through.
    const ghlLocationId = headers.ghlLocationId;

    // Toggle guard: check sync_controls mode for drchrono→ghl/appointments direction.
    const mode = await resolveModeAppt();
    if (mode === 'off') {
      dcLog.info({ tlpLocationId }, 'sendAppointments skipped — sync_controls mode=off');
      return { status: 200, data: { skipped: true, reason: 'mode-off' } };
    }

    // Allowlist guard: check GHL location ID namespace.  Fail closed if GHL ID unavailable.
    if (!ghlLocationId) {
      dcLog.error({ tlpLocationId }, 'sendAppointments blocked — ghlLocationId not set; cannot verify allowlist (fail-closed)');
      return { status: 200, data: { skipped: true, reason: 'allowlist-blocked' } };
    }
    if (!checkAllowlist(ghlLocationId)) {
      dcLog.error({ ghlLocationId, tlpLocationId }, 'sendAppointments blocked — location not in allowlist');
      return { status: 200, data: { skipped: true, reason: 'allowlist-blocked' } };
    }

    if (mode === 'dry') {
      dcLog.info({ tlpLocationId, count: appointments.length }, 'sendAppointments dry-run — would send appointments (no call)');
      return { status: 200, data: { skipped: true, reason: 'mode-dry' } };
    }

    // verify mode: capture intent only — no live write (fail-closed like dry).
    if (mode === 'verify') {
      dcLog.info({ tlpLocationId, count: appointments.length }, 'sendAppointments verify — captured intent, no live write');
      return { status: 200, data: { skipped: true, reason: 'mode-verify' } };
    }

    // mode=on: stamp each appointment with the loop-prevention origin tag so the
    // downstream GHL write carries it in `notes`. The resulting webhook echo will
    // be recognized as self-authored (origin.isSelfAuthored) and skipped.
    const originTag = tagFor('ghl', `legacy-appt-${Date.now()}`);
    // Populate locationId + calendarId so translateApptTLPtoGHL produces a valid
    // GHL appointment (the appt controller builds the GHL payload from these).
    // BIDI-01: route each appointment to the GHL calendar mapped to its DrChrono
    // profile id; fall back to the location default calendar when unmapped/null.
    const profileMap = headers.profileCalendarMap || {};
    const resolveCalendar = (a: TLPAppointmentPayload): string => {
      const byProfile = a.profileId != null ? profileMap[String(a.profileId)] : undefined;
      return byProfile || a.calendarId || headers.tlpCalendarId;
    };
    const taggedAppointments = appointments.map((a) => ({
      ...a,
      syncOriginTag: originTag,
      locationId: ghlLocationId,
      calendarId: resolveCalendar(a),
    }));

    const url = `${TLP_PATIENT_API}/appt`;

    let authJwt: string;
    let ghlAccessToken: string;
    try {
      const minted = await mintTokenForLocation(ghlLocationId);
      authJwt = minted.token;
      ghlAccessToken = minted.ghlAccessToken;
    } catch (e: any) {
      dcLog.error({ ghlLocationId, err: e?.message }, 'sendAppointments: mintTokenForLocation failed — GHL token may need re-authorization');
      return { status: 401, data: { error: 'no_valid_jwt', reason: e?.message } };
    }

    const resp = await httpFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authJwt}`,
        'x-tlp-app-location': `${headers.tlpLocation} ${headers.tlpToken}`,
        'x-tlp-app-timezone': headers.timezone,
        'x-tlp-app-jwt': ghlAccessToken,
        'x-tlp-app-pushghl': '1',
        'x-tlp-app-pushappt': '1',
      },
      body: JSON.stringify({ appointments: taggedAppointments }),
    });

    if (resp.status >= 200 && resp.status < 300) {
      const data = await resp.json();
      return { status: resp.status, data };
    }
    return { status: resp.status, data: resp.statusText };
  };

  return {
    sendPatients,
    sendAppointments,
  };
};

export const patientServiceClient = createPatientServiceClient();

// ---------------------------------------------------------------------------
// Data mapping helpers
// ---------------------------------------------------------------------------

export const mapPatient = (p: DrChronoPatient, timezone: string): TLPPatientPayload => ({
  patientId: p.id,
  firstName: p.first_name,
  lastName: p.last_name,
  email: p.email || '',
  phone: p.home_phone || '',
  mobile: p.cell_phone || '',
  work: p.office_phone || '',
  address: p.address || '',
  address2: p.address_line2 || '',
  city: p.city || '',
  state: p.state || '',
  postalCode: p.zip_code || '',
  country: 'US',
  dob: p.date_of_birth || '',
  timezone,
});

export const mapAppointment = (a: DrChronoAppointment): TLPAppointmentPayload => ({
  apptId: a.id,
  patientId: a.patient,
  apptTime: a.scheduled_time,
  apptStatus: a.status,
  isBreak: a.appt_is_break === true,
  durationMinutes: typeof a.duration === 'number' ? a.duration : undefined,
  title: a.reason || (a.appt_is_break ? 'Break' : undefined),
  profileId: a.profile ?? null,
});

export const buildLocationHeaders = (location: DrChronoConfigLocation): LocationHeaders => ({
  tlpLocation: location.tlpLocation,
  tlpToken: location.tlpToken,
  tlpJwt: location.tlpJwt,
  tlpCalendarId: location.tlpCalendarId,
  // Carry the GHL location ID so allowlist checks use the correct namespace.
  ghlLocationId: location.ghlLocationId,
  timezone: location.timezone,
  // Per-profile calendar routing (BIDI-01); empty/absent → default calendar only.
  profileCalendarMap: (location as any).profileCalendarMap || {},
});

/**
 * Given an API client and a list of appointments, fetch the referenced patients,
 * then send patients first (so mappings exist) then send appointments.
 */
export const syncPatientsAndAppointments = async (
  client: ReturnType<typeof drChronoAPIClient>,
  appointments: DrChronoAppointment[],
  location: DrChronoConfigLocation,
  locationHeaders: LocationHeaders,
) => {
  // Skip appointments with no patient (availability blocks / breaks) — getPatient(null) 404s.
  const patientIds = [...new Set(appointments.map((a) => a.patient).filter((id): id is number => id != null))];
  const patients: TLPPatientPayload[] = [];

  for (const patientId of patientIds) {
    const patResp = await client.getPatient(patientId);
    if (patResp.status >= 200 && patResp.status < 300) {
      patients.push(mapPatient(patResp.data as DrChronoPatient, location.timezone));
    } else {
      console.error(`failed to fetch patient ${patientId} for ${location.name}: ${patResp.data}`);
    }
  }

  if (patients.length > 0) {
    const patSendResp = await patientServiceClient.sendPatients(patients, locationHeaders);
    console.log(`${location.name}: patient sync ${patSendResp.status}`);
  }

  const apptPayloads: TLPAppointmentPayload[] = appointments.map(mapAppointment);
  const apptSendResp = await patientServiceClient.sendAppointments(apptPayloads, locationHeaders);
  console.log(`${location.name}: appointment sync ${apptSendResp.status}`);
};

// ---------------------------------------------------------------------------
// Polling client (on-demand, not auto-starting)
// ---------------------------------------------------------------------------

/**
 * Poll a single location for appointments + patients and push to TLP.
 * Can be called on demand rather than auto-starting.
 */
export const pollLocation = async (
  location: DrChronoConfigLocation,
  clientId: string,
  clientSecret: string,
  startDate: string,
  endDate: string,
) => {
  console.log(`polling location: ${location.name}`);

  const tokenResp = await drChronoAuth.getValidToken(
    location.name,
    clientId,
    clientSecret,
    location.accessToken,
    location.refreshToken,
    location.tokenExpiry,
  );

  if (tokenResp.status !== 200 || !tokenResp.accessToken) {
    console.error(`failed to get valid token for ${location.name}`);
    return;
  }

  const client = drChronoAPIClient(tokenResp.accessToken);
  const headers = buildLocationHeaders(location);

  const apptResp = await client.getAppointments(startDate, endDate);
  if (apptResp.status < 200 || apptResp.status >= 300) {
    console.error(`appointment fetch failed for ${location.name}: ${apptResp.data}`);
    return;
  }

  const appointments = apptResp.data as DrChronoAppointment[];
  console.log(`${location.name}: ${appointments.length} appointment(s) fetched`);
  if (appointments.length === 0) return;

  await syncPatientsAndAppointments(client, appointments, location, headers);
};

/**
 * Run a full poll across all configured locations.
 * This is the on-demand equivalent of the old auto-starting polling client.
 */
export const runFullPoll = async () => {
  const cfg = await drChronoConfigService.getConfig();
  if (!cfg) {
    console.error('no drchrono config found in database');
    return;
  }

  const lookAheadDays = cfg.config.LookAheadDays;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + lookAheadDays);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const startString = formatDate(yesterday);
  const endString = formatDate(futureDate);

  console.log(`polling DrChrono: ${startString} -> ${endString}`);

  for (const location of cfg.locations as any[]) {
    await pollLocation(
      location as DrChronoConfigLocation,
      cfg.clientId,
      cfg.clientSecret,
      startString,
      endString,
    );
  }
};

/**
 * One-time (idempotent) backfill: pull EVERY existing DrChrono patient for each
 * configured location into GHL, regardless of whether they have an appointment in
 * the poll window. New patients thereafter arrive via the PATIENT_CREATE webhook.
 * Allowlist still gates the actual GHL write (fail-closed for non-demo locations).
 */
export const backfillPatients = async () => {
  const cfg = await drChronoConfigService.getConfig();
  if (!cfg) {
    console.error('backfill: no drchrono config found in database');
    return;
  }

  const CHUNK = 50;

  for (const loc of cfg.locations as any[]) {
    const location = loc as DrChronoConfigLocation;
    const tokenResp = await drChronoAuth.getValidToken(
      location.name,
      cfg.clientId,
      cfg.clientSecret,
      location.accessToken,
      location.refreshToken,
      location.tokenExpiry,
    );
    if (tokenResp.status !== 200 || !tokenResp.accessToken) {
      console.error(`backfill: token refresh failed for ${location.name}`);
      continue;
    }

    const client = drChronoAPIClient(tokenResp.accessToken);
    const headers = buildLocationHeaders(location);

    const resp = await client.getAllPatients(location.doctorId);
    if (resp.status !== 200) {
      console.error(`backfill: getAllPatients failed for ${location.name}: ${resp.data}`);
      continue;
    }

    const patients = (resp.data as DrChronoPatient[]).map((p) =>
      mapPatient(p, location.timezone),
    );
    console.log(`backfill: ${location.name} -> ${patients.length} patients`);

    for (let i = 0; i < patients.length; i += CHUNK) {
      const batch = patients.slice(i, i + CHUNK);
      const r = await patientServiceClient.sendPatients(batch, headers);
      console.log(
        `backfill: ${location.name} batch ${Math.floor(i / CHUNK) + 1}/${Math.ceil(
          patients.length / CHUNK,
        )} (${batch.length}) -> status ${r.status}`,
      );
    }
  }
  console.log('backfill: complete');
};
