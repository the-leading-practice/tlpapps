import { drChronoConfigService } from 'services/drChronoConfig/drChronoConfig';
import { drChronoAuth } from 'services/auth';
import { drChronoAPIClient } from 'services/drChronoAPIClient';
import { patientServiceClient } from 'services/patientServiceClient';
import { state } from './state';
import { getDateString, dayAdd } from './lib/utils/date';
import {
  DrChronoConfig,
  DrChronoConfigLocation,
  DrChronoAppointment,
  DrChronoPatient,
  TLPPatientPayload,
  TLPAppointmentPayload,
} from 'types';

export const mapPatient = ( p: DrChronoPatient, timezone: string ): TLPPatientPayload => ({
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

export const mapAppointment = ( a: DrChronoAppointment ): TLPAppointmentPayload => ({
  apptId: a.id,
  patientId: a.patient,
  apptTime: a.scheduled_time,
  apptStatus: a.status,
});

export const createDrChronoClient = () => {
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let config: DrChronoConfig;

  const init = async () => {
    const resp = await drChronoConfigService.getConfig();

    if( !resp ) {
      console.error( 'no drchrono config found in database' );
      return;
    }

    config = {
      clientId: resp.clientId,
      clientSecret: resp.clientSecret,
      webhookSecret: resp.webhookSecret,
      config: resp.config,
      locations: resp.locations as DrChronoConfigLocation[],
    };

    console.log( `drchrono-client starting with ${config.locations.length} location(s)` );

    await _pollDrChrono();

    pollTimer = setInterval( _pollDrChrono, config.config.RepeatMilliseconds );
  }

  const _pollDrChrono = async () => {
    const pollDate = new Date();

    // poll from yesterday (catch status changes on today's appts) to LookAheadDays out
    const startDate = dayAdd( new Date(), -1 );
    const endDate = dayAdd( new Date(), config.config.LookAheadDays );
    const startString = getDateString( startDate );
    const endString = getDateString( endDate );

    console.log( `polling DrChrono: ${startString} → ${endString}` );

    for( const location of config.locations ) {
      await pollLocation( location, config.clientId, config.clientSecret, startString, endString );
    }

    state.set( { lastDate: pollDate } );
  }

  return { init }
}

/**
 * Fetch appointments + patients for a location and push to patient service.
 * Exported so the webhook handler can reuse it for a single appointment sync.
 */
export const pollLocation = async (
  location: DrChronoConfigLocation,
  clientId: string,
  clientSecret: string,
  startDate: string,
  endDate: string
) => {
  console.log( `polling location: ${location.name}` );

  const tokenResp = await drChronoAuth.getValidToken(
    location.name,
    clientId,
    clientSecret,
    location.accessToken,
    location.refreshToken,
    location.tokenExpiry
  );

  if( tokenResp.status !== 200 || !tokenResp.accessToken ) {
    console.error( `failed to get valid token for ${location.name}` );
    return;
  }

  const client = drChronoAPIClient( tokenResp.accessToken );
  const locationHeaders = buildLocationHeaders( location );

  const apptResp = await client.getAppointments( startDate, endDate );
  if( apptResp.status < 200 || apptResp.status >= 300 ) {
    console.error( `appointment fetch failed for ${location.name}: ${apptResp.data}` );
    return;
  }

  const appointments = apptResp.data as DrChronoAppointment[];
  console.log( `${location.name}: ${appointments.length} appointment(s) fetched` );
  if( appointments.length === 0 ) return;

  await syncPatientsAndAppointments( client, appointments, location, locationHeaders );
}

/**
 * Given an API client and a list of appointments, fetch the referenced patients,
 * then send patients first (so mappings exist) then send appointments.
 */
export const syncPatientsAndAppointments = async (
  client: ReturnType<typeof drChronoAPIClient>,
  appointments: DrChronoAppointment[],
  location: DrChronoConfigLocation,
  locationHeaders: ReturnType<typeof buildLocationHeaders>
) => {
  const patientIds = [ ...new Set( appointments.map( a => a.patient ) ) ];
  const patients: TLPPatientPayload[] = [];

  for( const patientId of patientIds ) {
    const patResp = await client.getPatient( patientId );
    if( patResp.status >= 200 && patResp.status < 300 ) {
      patients.push( mapPatient( patResp.data as DrChronoPatient, location.timezone ) );
    } else {
      console.error( `failed to fetch patient ${patientId} for ${location.name}: ${patResp.data}` );
    }
  }

  if( patients.length > 0 ) {
    const patSendResp = await patientServiceClient.sendPatients( patients, locationHeaders );
    console.log( `${location.name}: patient sync ${patSendResp.status}` );
  }

  const apptPayloads: TLPAppointmentPayload[] = appointments.map( mapAppointment );
  const apptSendResp = await patientServiceClient.sendAppointments( apptPayloads, locationHeaders );
  console.log( `${location.name}: appointment sync ${apptSendResp.status}` );
}

export const buildLocationHeaders = ( location: DrChronoConfigLocation ) => ({
  tlpLocation: location.tlpLocation,
  tlpToken: location.tlpToken,
  tlpJwt: location.tlpJwt,
  tlpCalendarId: location.tlpCalendarId,
  timezone: location.timezone,
});
