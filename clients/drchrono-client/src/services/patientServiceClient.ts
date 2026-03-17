import { TLP_PATIENT_API } from 'lib/constants';
import { TLPPatientPayload, TLPAppointmentPayload } from 'types';

type LocationHeaders = {
  tlpLocation: string;
  tlpToken: string;
  tlpJwt: string;
  tlpCalendarId: string;
  timezone: string;
};

const createPatientServiceClient = () => {

  const sendPatients = async ( patients: TLPPatientPayload[], headers: LocationHeaders ) => {
    const url = `${TLP_PATIENT_API}/patient`;

    const resp = await fetch( url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tlp-app-location': `${headers.tlpLocation} ${headers.tlpToken}`,
        'x-tlp-app-timezone': headers.timezone,
        'x-tlp-app-jwt': headers.tlpJwt,
        'x-tlp-app-pushghl': '1',
        'x-tlp-app-pushpat': '1',
      },
      body: JSON.stringify( { patients } ),
    } );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return { status: resp.status, data };
    }
    return { status: resp.status, data: resp.statusText };
  }

  const sendAppointments = async ( appointments: TLPAppointmentPayload[], headers: LocationHeaders ) => {
    const url = `${TLP_PATIENT_API}/appt`;

    const resp = await fetch( url, {
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
      body: JSON.stringify( { appointments } ),
    } );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return { status: resp.status, data };
    }
    return { status: resp.status, data: resp.statusText };
  }

  return {
    sendPatients,
    sendAppointments,
  }
}

export const patientServiceClient = createPatientServiceClient();
