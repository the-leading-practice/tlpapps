import { Application } from 'express';
import { patientController } from 'controllers/patientController';
import { appointmentController } from 'controllers/appointmentController';

export const routes = ( app: Application ) => {
  app.route( '/' ).get( patientController.index );

  app.route( '/patient' )
    .post( patientController.createPatient );

  app.route( '/patient/:id' )
    .get( patientController.patient )
    .post( patientController.updatePatient )
    .delete( patientController.deletePatient );

  app.route( '/appt' )
    .get( appointmentController.appointments )
    .post( appointmentController.createAppointments );

  app.route( '/appt/:id' )
    .get( appointmentController.appointment )
    .delete( appointmentController.deleteAppt );
}
