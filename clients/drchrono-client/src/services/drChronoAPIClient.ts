import { DRCHRONO_API } from 'lib/constants';
import { DrChronoPatient, DrChronoAppointment, DrChronoListResponse } from 'types';

export const drChronoAPIClient = ( token: string ) => {
  const access_token = token;

  const processResp = async <T>( resp: Response ): Promise<{ status: number; data: T | string }> => {
    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json() as T;
      return { status: resp.status, data };
    }
    return { status: resp.status, data: resp.statusText };
  }

  const authHeaders = () => ({
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  });

  /**
   * Get appointments for a date range.
   * DrChrono expects date_range as "YYYY-MM-DD/YYYY-MM-DD"
   * Handles pagination automatically, returning all results.
   */
  const getAppointments = async ( startDate: string, endDate: string ): Promise<{ status: number; data: DrChronoAppointment[] | string }> => {
    const allAppointments: DrChronoAppointment[] = [];
    let url: string | null = `${DRCHRONO_API}/api/appointments?date_range=${startDate}%2F${endDate}`;

    while( url ) {
      const resp = await fetch( url, { method: 'GET', headers: authHeaders() } );
      const result = await processResp<DrChronoListResponse<DrChronoAppointment>>( resp );

      if( result.status < 200 || result.status >= 300 ) {
        return { status: result.status, data: result.data as string };
      }

      const page = result.data as DrChronoListResponse<DrChronoAppointment>;
      allAppointments.push( ...page.results );
      url = page.next;
    }

    return { status: 200, data: allAppointments };
  }

  /**
   * Get a single patient by DrChrono patient ID.
   */
  const getPatient = async ( patientId: number ): Promise<{ status: number; data: DrChronoPatient | string }> => {
    const url = `${DRCHRONO_API}/api/patients/${patientId}`;
    const resp = await fetch( url, { method: 'GET', headers: authHeaders() } );
    return processResp<DrChronoPatient>( resp );
  }

  return {
    getAppointments,
    getPatient,
  }
}
