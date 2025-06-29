import { silkOneConfigService } from "services/silkOneConfig/silkOneConfig";
import { SilkOneAppointment, PatientRequest } from "types";
import { SilkOneConfig } from "types";
import { silkOneAuth } from "services/auth";
import { silkOneAPIClient } from "services/silkOneAPIClient";
import { state } from './state';
import { get } from './lib/store';
import { getDateString, monthAdd } from "./lib/utils/date";

/**
 * Silk One Client polls for changes and pushes data to GHL via 
 * tlpapps api
 */
export const createSilkOneClient = () => {
  let pollTimer;
  let config: SilkOneConfig;

  const init = async() => {
    // get config
    const resp = await silkOneConfigService.getConfig();

    if( resp ) {
      config = {
        config: resp.config,
        locations: resp.locations
      }
    }

    // TODO - add first run variable so the first time a location is run it will pull all appts from the last year

    console.log( config );

    // do an initial poll
    _pollSilkOne();

    // setup timer
    if( config ) {
      pollTimer = setInterval( _pollSilkOne, config.config.RepeatMilliseconds );
    }
  }

  const _getPatientData = async ( patientArr: PatientRequest[], client: any ) => {
    const patResp = await client.getPatients( patientArr );

    if( patResp.status === 200 ) {
      // attempt to add each patient to GHL
    }
  }

  const _pollSilkOne = async () => {
    console.log( get( state ) );
    

    // for each location assigned - do this loop
    const locations = config.locations || [];

    const pollDate = new Date();
    const startDate = (get( state ) as any)?.lastDate || new Date();
    const endDate = monthAdd( startDate, 2 );

    const startString = getDateString( startDate );
    const endString = getDateString( endDate );

    for( const location of locations ) {
      console.log( `polling ${location.clientId}` );

      const resp = await silkOneAuth.getToken( location.clientId, location.secret );
      console.log( resp );

      if( resp.status === 200 ) {
        const client = silkOneAPIClient( resp.data.access_token );
        const appResp = await client.getAppointments( startString, endString );

        if( appResp.status === 200 ) {
          // process appointments and extract patient ids for retrieval
          const patients: PatientRequest[] = [];
          appResp.data.forEach( (app: SilkOneAppointment) => {
            patients.push( {patient_key: app.patient_key.toString() } );
          } );

          // use extracted patient ids to request patient data
          
          
        }
      }

    }

    state.set( {lastDate: pollDate} );
  }

  return {
    init
  }
}
