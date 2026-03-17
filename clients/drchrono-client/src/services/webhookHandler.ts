import { drChronoConfigService } from './drChronoConfig/drChronoConfig';
import { drChronoAuth } from './auth';
import { drChronoAPIClient } from './drChronoAPIClient';
import { patientServiceClient } from './patientServiceClient';
import {
  DrChronoWebhookPayload,
  DrChronoAppointment,
  DrChronoPatient,
  DrChronoConfigLocation,
} from 'types';
import {
  mapPatient,
  mapAppointment,
  buildLocationHeaders,
  syncPatientsAndAppointments,
} from 'drChronoClient';

const APPOINTMENT_EVENTS = new Set( [
  'APPOINTMENT_CREATE',
  'APPOINTMENT_MODIFY',
] );

const PATIENT_EVENTS = new Set( [
  'PATIENT_CREATE',
  'PATIENT_MODIFY',
] );

const createWebhookHandler = () => {

  /**
   * Entry point — called by the Express POST /webhook/drchrono route.
   * Returns an HTTP status code to send back to DrChrono.
   */
  const handleEvent = async ( payload: DrChronoWebhookPayload ): Promise<number> => {
    const config = await drChronoConfigService.getConfig();
    if( !config ) {
      console.error( 'webhook: no config found' );
      return 500;
    }

    // Verify the secret token matches what we set in the DrChrono dashboard
    if( payload.secret_token !== config.webhookSecret ) {
      console.error( 'webhook: invalid secret_token' );
      return 403;
    }

    // Find which location this event belongs to based on the doctor ID
    const location = config.locations.find(
      ( l: any ) => l.doctorId === payload.doctor
    ) as DrChronoConfigLocation | undefined;

    if( !location ) {
      console.warn( `webhook: no location found for doctor ${payload.doctor} — skipping` );
      return 200;
    }

    const tokenResp = await drChronoAuth.getValidToken(
      location.name,
      config.clientId,
      config.clientSecret,
      location.accessToken,
      location.refreshToken,
      location.tokenExpiry
    );

    if( tokenResp.status !== 200 || !tokenResp.accessToken ) {
      console.error( `webhook: token refresh failed for ${location.name}` );
      return 500;
    }

    const client = drChronoAPIClient( tokenResp.accessToken );
    const locationHeaders = buildLocationHeaders( location );

    if( APPOINTMENT_EVENTS.has( payload.action ) ) {
      const appt = payload.object as DrChronoAppointment;
      await syncPatientsAndAppointments( client, [appt], location, locationHeaders );

    } else if( PATIENT_EVENTS.has( payload.action ) ) {
      const patient = mapPatient( payload.object as DrChronoPatient, location.timezone );
      await patientServiceClient.sendPatients( [patient], locationHeaders );

    } else if( payload.action === 'APPOINTMENT_DELETE' ) {
      // Patient service doesn't support appointment deletion yet — log and skip
      console.log( `webhook: APPOINTMENT_DELETE for appt ${(payload.object as DrChronoAppointment).id} — no-op` );
    }

    return 200;
  }

  return { handleEvent }
}

export const webhookHandler = createWebhookHandler();
