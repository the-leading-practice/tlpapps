import { TLP_API_URL } from "constants/constants";
import { TLPAppointmentData } from "types/common";

const createIntegrationService = () => {

  const getContact = async( contactId: string, jwt: string ) => {
    const opts = {
      method: 'GET',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      }
    }

    const resp = await fetch( `${TLP_API_URL}ghl/contact/${contactId}`, opts );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }
    return {status: resp.status, data: resp.statusText};
  }

  const findContact = async( patient: any, jwt: string ) => {
    const opts = {
      method: 'get',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      }
    }

    let query = '';

    // query for contact based on email, name, phone - which-ever is first
    if( patient.email ) query = patient.email;
    else if( patient.firstName && patient.lastName ) query = `${patient.firstName} ${patient.lastName}`;
    else if( patient.phone ) query = patient.mobile;

    const resp = await fetch( `${TLP_API_URL}ghl/contacts/${query}`, opts );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }
    return {status: resp.status, data: resp.statusText};
  }

  const createContact = async( patient: any, jwt: string ) => {
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      },
      body: JSON.stringify( patient )
    }

    const resp = await fetch( `${TLP_API_URL}ghl/contact`, opts );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }
    return {status: resp.status, data: resp.statusText};
  }

  const upsertContact = async( patient: any, jwt: string ) => {
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      },
      body: JSON.stringify( patient )
    }

    const resp = await fetch( `${TLP_API_URL}ghl/contact`, opts );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }
    return {status: resp.status, data: resp.statusText};
  }

  const updateContact = async( patient: any, contactId: string, jwt: string ) => {
    const modPatient = patient;

    modPatient.name = modPatient.contactName;
    delete modPatient.contactName;

    const opts = {
      method: 'PUT',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      },
      body: JSON.stringify( modPatient )
    }

    const resp = await fetch( `${TLP_API_URL}ghl/contact/${contactId}`, opts );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }
    return {status: resp.status, data: resp.statusText};
  }

  const getAppointment = async( appt: string, jwt: string ) => {
    const opts = {
      method: 'get',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      }
    }

    // query for contact based on email, name, phone - which-ever is first
    const resp = await fetch( `${TLP_API_URL}ghl/contacts/${appt}`, opts );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }
    return {status: resp.status, data: resp.statusText};
  }

  const getAppointmentsForContact = async( contactId: string, jwt: string ) => {
    const opts = {
      method: 'GET',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      }
    }

    const resp = await fetch( `${TLP_API_URL}ghl/contact/appointments/${contactId}`, opts );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }

    return {status: resp.status, data: resp.statusText};
  }

  const createAppointment = async( appt: TLPAppointmentData, jwt: string ) => {
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      },
      body: JSON.stringify( appt )
    }

    const resp = await fetch( `${TLP_API_URL}ghl/appointment`, opts );
    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }

    return {status: resp.status, data: resp.statusText};
  }

  const updateAppointment = async( appt: TLPAppointmentData, jwt: string ) => {
    const opts = {
      method: 'PUT',
      headers: {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${jwt}`
      },
      body: JSON.stringify( appt ) 
    }

    const resp = await fetch( `${TLP_API_URL}ghl/appointment`, opts );
    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }

    return {status: resp.status, data: resp.statusText};
  }

  return {
    getContact,
    findContact,
    getAppointment,
    createContact,
    upsertContact,
    updateContact,
    getAppointmentsForContact,
    createAppointment,
    updateAppointment
  }
}

export const integrationService = createIntegrationService();