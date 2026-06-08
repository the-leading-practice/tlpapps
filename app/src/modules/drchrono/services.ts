import { config } from '../../config.js';
import { writeModeForEntity } from '../sync/writers/dispatch.js';
import { isLocationAllowed } from '../sync/writers/allowlist.js';
import { logger } from '../../logger.js';
import { DrChronoConfigModel } from '../../models/drchronoConfig.js';
import type {
  DrChronoTokenResponse,
  DrChronoPatient,
  DrChronoAppointment,
  DrChronoListResponse,
  DrChronoConfigLocation,
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

  return {
    getAppointments,
    getPatient,
  };
};

// ---------------------------------------------------------------------------
// Patient Service Client (sends data to TLP patient-service)
// ---------------------------------------------------------------------------

const dcLog = logger.child({ module: 'drchrono-service-client' });

const createPatientServiceClient = () => {
  const sendPatients = async (patients: TLPPatientPayload[], headers: LocationHeaders) => {
    const locationId = headers.tlpLocation;

    // Toggle guard: check sync_controls mode for drchrono→ghl/patients direction.
    const mode = await writeModeForEntity('drchrono_to_ghl', 'patients').catch(() => 'dry' as const);
    if (mode === 'off') {
      dcLog.info({ locationId }, 'sendPatients skipped — sync_controls mode=off');
      return { status: 200, data: { skipped: true, reason: 'mode-off' } };
    }

    // Allowlist guard: hard-block forbidden real-practice IDs.
    if (!isLocationAllowed(locationId)) {
      dcLog.error({ locationId }, 'sendPatients blocked — location not in allowlist');
      return { status: 200, data: { skipped: true, reason: 'allowlist-blocked' } };
    }

    if (mode === 'dry') {
      dcLog.info({ locationId, count: patients.length }, 'sendPatients dry-run — would send patients (no call)');
      return { status: 200, data: { skipped: true, reason: 'mode-dry' } };
    }

    const url = `${TLP_PATIENT_API}/patient`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tlp-app-location': `${headers.tlpLocation} ${headers.tlpToken}`,
        'x-tlp-app-timezone': headers.timezone,
        'x-tlp-app-jwt': headers.tlpJwt,
        'x-tlp-app-pushghl': '1',
        'x-tlp-app-pushpat': '1',
      },
      body: JSON.stringify({ patients }),
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
    const locationId = headers.tlpLocation;

    // Toggle guard: check sync_controls mode for drchrono→ghl/appointments direction.
    const mode = await writeModeForEntity('drchrono_to_ghl', 'appointments').catch(() => 'dry' as const);
    if (mode === 'off') {
      dcLog.info({ locationId }, 'sendAppointments skipped — sync_controls mode=off');
      return { status: 200, data: { skipped: true, reason: 'mode-off' } };
    }

    // Allowlist guard: hard-block forbidden real-practice IDs.
    if (!isLocationAllowed(locationId)) {
      dcLog.error({ locationId }, 'sendAppointments blocked — location not in allowlist');
      return { status: 200, data: { skipped: true, reason: 'allowlist-blocked' } };
    }

    if (mode === 'dry') {
      dcLog.info({ locationId, count: appointments.length }, 'sendAppointments dry-run — would send appointments (no call)');
      return { status: 200, data: { skipped: true, reason: 'mode-dry' } };
    }

    const url = `${TLP_PATIENT_API}/appt`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tlp-app-location': `${headers.tlpLocation} ${headers.tlpToken}`,
        'x-tlp-app-calendar': headers.tlpCalendarId,
        'x-tlp-app-timezone': headers.timezone,
        'x-tlp-app-jwt': headers.tlpJwt,
        'x-tlp-app-pushghl': '1',
        'x-tlp-app-pushappt': '1',
        'x-tlp-app-software': 'DrChrono',
      },
      body: JSON.stringify({ appointments }),
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
});

export const buildLocationHeaders = (location: DrChronoConfigLocation): LocationHeaders => ({
  tlpLocation: location.tlpLocation,
  tlpToken: location.tlpToken,
  tlpJwt: location.tlpJwt,
  tlpCalendarId: location.tlpCalendarId,
  timezone: location.timezone,
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
  const patientIds = [...new Set(appointments.map((a) => a.patient))];
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
