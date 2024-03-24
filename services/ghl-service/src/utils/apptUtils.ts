import { GHLAppointmentData, TLPAppointmentData } from "types/common";
import { safeStringCompare } from './common';

export const verifyAppointment = ( ghlAppt: GHLAppointmentData, tlpAppt: TLPAppointmentData ) => {
  // main points of verification: calendarId, startTime
  if( tlpAppt.calendarId && tlpAppt.contactId ) {
    if( safeStringCompare( ghlAppt.calendarId, tlpAppt.calendarId ) ) {
    }
  }
}

export const translateApptGHLtoTLP = ( appt: GHLAppointmentData ): TLPAppointmentData => {
  console.log( `appointment` );
  console.log( appt );
  const appointment: TLPAppointmentData = {
    patientId: -1,
    contactId: appt.contactId,
    apptId: -1,
    ghlApptId: appt.id || "",
    startTime: appt.startTime,
    status: appt.appoinmentStatus || "",
    calendarId: appt.calendarId,
    locationId: appt.locationId,
  }

  console.log( 'translateApptGHLtoTLP' );
  console.log( appointment );

  return appointment;
}

export const translateApptTLPtoGHL = ( appt: TLPAppointmentData, location: string | undefined, calendar: string ): GHLAppointmentData => {
  const appointment: GHLAppointmentData = { 
    calendarId: calendar,
    locationId: location || "",
    contactId: appt.contactId || "",
    id: appt.ghlApptId,
    startTime: appt.startTime,
    appointmentStatus: appt.status,
    toNotify: false,
    address: `${appt.apptId}`
  }

  console.log( 'translateApptTLPtoGHL' );
  console.log( appointment );

  return appointment;
}