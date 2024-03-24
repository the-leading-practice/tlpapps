import { Appointment } from "models/appointment";
import { ApptData, TLPAppointmentData } from "types/common";

const createAppointmentService = () => {

  const getAppointments = async ( locationId: string ) => {
    const Appointments = await Appointment.find( {locationId: locationId} );
    return Appointments;
  }

  const getAppointment = async ( 
    locationId: string, 
    apptId: number, 
    calendarId: string | undefined = undefined, 
    appt: ApptData | undefined = undefined ) => {
    const appointment = await Appointment.findOne( {locationId: locationId, apptId: apptId} );
    let mapping: TLPAppointmentData | null = null;

    if( appointment ) {
      mapping = {
        patientId: appointment.patientId,
        contactId: appointment.contactId,
        apptId: appointment.apptId,
        ghlApptId: appointment.ghlApptId,
        startTime: appointment.startTime,
        calendarId: appointment.calendarId,
        locationId: appointment.locationId,
        status: appointment.status || ''
      };
    }

    return mapping;
  }

  const upsertAppointment = async ( appt: TLPAppointmentData ) => {
    const query = {locationId: appt.locationId, apptId: appt.apptId};
    const newPatient = {
      apptId: appt.apptId, 
      patientId: appt.patientId,
      contactId: appt.contactId,
      ghlApptId: appt.ghlApptId,
      locationId: appt.locationId, 
      calendarId: appt.calendarId, 
      startTime: appt.startTime,
      status: appt.status,
      reset: false
    };

    const newDoc = await Appointment.findOneAndUpdate( query, newPatient, {upsert: true, new: true} );
    return newDoc;
  }

  return {
    getAppointments,
    getAppointment,
    upsertAppointment
  }
}

export const appointmentService = createAppointmentService();