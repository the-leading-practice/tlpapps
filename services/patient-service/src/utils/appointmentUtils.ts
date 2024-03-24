import { ApptData, TLPAppointmentData, LocationSetting } from "types/common";
import { ChrioTouchMapping, MappingEntry } from "./statusMapping";
import { formatTime, getLocation } from "./common";
import { integrationService } from "services/integration";
import { appointmentService } from "services/appointment";
import { patientService } from "services/patient";
import { logger } from '../logger';

export const generateAppointment = async ( tlpAppt: ApptData, settings: LocationSetting, softwareName: string ): Promise<TLPAppointmentData> => {
  const location = getLocation( settings.locHeader ).location;
  const formattedTime = formatTime( tlpAppt.apptTime, settings.timezone );

  const newAppt: TLPAppointmentData = {
    patientId: tlpAppt.patientId,
    apptId: tlpAppt.apptId,
    startTime: formattedTime || tlpAppt.apptTime,
    status: getAppointmentStatus( softwareName, `${tlpAppt.apptStatus}` ),
    address: `${tlpAppt.patientId}`,
    locationId: location,
    calendarId: settings.calendarId
  }
  
  // find patient
  const patient = await patientService.getPatient( location, tlpAppt.patientId );
  if( !patient ) return newAppt;

  newAppt.contactId = patient.contactId;

  if( newAppt.contactId.length <= 0 ) {
    logger.writeLog( 'warn', `missing contactId for appointment ${tlpAppt.apptId}` );
    logger.writeLog( 'warn', JSON.stringify( tlpAppt ) );
  }
  
  // find mapping entry
  const mapping = await appointmentService.getAppointment( location, tlpAppt.apptId );
  if( mapping ) {
    logger.writeLog( 'debug', `appointment ${tlpAppt.apptId} exists in mapping db with ghlApptId ${mapping.ghlApptId}` );
    newAppt.ghlApptId = mapping.ghlApptId;
  } else { logger.writeLog( 'debug', `no mapping found for appointment ${tlpAppt.apptId}` ) }

  // see if this appointment exists at GHL
  let ghlAppt: TLPAppointmentData | null = null;
  if( !mapping || !mapping.ghlApptId ) {
    const resp = await integrationService.getAppointmentsForContact( patient.contactId, settings.jwt );
    if( resp.status >= 200 && resp.status < 300 ) {
      ghlAppt = resp.data.find( ( a: TLPAppointmentData ) => {
        return( new Date( a.startTime ).getTime() === new Date( newAppt.startTime ).getTime() )
      } );
      if( ghlAppt ) {
        logger.writeLog( 'debug', `found ${ghlAppt?.ghlApptId} merging with ${tlpAppt.apptId}` );
      }
    }
  }
  
  // this appointment doesn't exist in the mapping db but does at GHL
  if( ghlAppt ) { 
    newAppt.ghlApptId = ghlAppt.ghlApptId;
  }
  
  return newAppt;
}

export const getAppointmentStatus = ( name: string, status: string ) => {
  let mapping: MappingEntry | undefined;
  switch( name ) {
    case "ChiroTouch":
      mapping = ChrioTouchMapping.entries.find( ( e: MappingEntry ) => e.status === status );
      break;
  }

  if( mapping !== undefined ) {
    return mapping.ghlValue;
  }

  return "new";
}