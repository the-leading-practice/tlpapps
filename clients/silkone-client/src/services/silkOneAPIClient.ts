
import { SILK_ONE_API } from "lib/constants";

export const silkOneAPIClient = ( token: string ) => {
  const access_token = token;

  const processResp = async ( resp: Response ) => {
    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }

    return {status: resp.status, data: resp.statusText};
  }

  const getAppointments = async ( start: string, end: string ) => {
    const url = `${SILK_ONE_API}/appointment/by_date?appointment_start_date=${start}&appointment_end_date=${end}`;

    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    }

    const resp = await fetch( url, options );
    return await processResp( resp );
  }

  const getPatients = async ( ids: {patient_key: string}[] ) => {
    const url = `${SILK_ONE_API}/patient/by_ids`;
    const body = JSON.stringify( ids );

    console.log( body );
    const options = {
      method: 'POST',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      }
    }

    const resp = await fetch( url, options );
    return await processResp( resp );
  }

  const getLocations = async () => {
    const url = `${SILK_ONE_API}/locations`;

    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    }

    const resp = await fetch( url, options );
    return await processResp( resp );
  }

  const getProviders = async () => {
    const url = `${SILK_ONE_API}/providers`;

    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    }

    const resp = await fetch( url, options );
    return await processResp( resp );
  }

  return {  
    getAppointments,
    getPatients
  }
}
