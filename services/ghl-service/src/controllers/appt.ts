import express from 'express';
import { formatTime, getLocation } from 'utils/common';
import { appointmentService } from 'services/appointment';
import { GHLAppointmentData, TLPAppointmentData } from 'types/common';
import { translateApptGHLtoTLP, translateApptTLPtoGHL } from 'utils/apptUtils';
import { logger } from 'logger';

const createApptController = () => {
  const getAppointment = async ( req: express.Request, res: express.Response ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const timezone = req.headers['x-tlp-app-timezone'] as string || "";
    const calendarId = req.headers['x-tlp-app-calendar'] as string || "";
    const loc = getLocation( locHeader );
    const eventId = req.params.id;

		logger.writeLog( 'info', 'getAppointment()', `request to get appointment ${eventId}` );

    if( loc.location && loc.token ) {
      const resp = await appointmentService.getAppointment( eventId, loc.token );

      if( resp.status === 200 ) {
        const appointment = translateApptGHLtoTLP( resp.data );
        const newTime = formatTime( appointment.startTime, timezone );

        if( newTime === null ) {
					logger.writeLog( 'warn', 'getAppointment()', `unable to format time for appointment ${eventId} time:${appointment.startTime} - sending original` );
          // console.log( `unable to format time ${appointment.startTime} - sending original` );
        }
        appointment.startTime = newTime || appointment.startTime;

        // console.log( appointment );
				logger.writeLog( 'info', 'getAppointment()', `found appointment for ${eventId}`, appointment );
        
        return res.status( resp.status ).json( appointment );
      }

      return res.status( resp.status ).json( resp.data );
    }

    return res.sendStatus( 401 );

  }

  const getAppointmentsForContact = async ( req: express.Request, res: express.Response ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const timezone = req.headers['x-tlp-app-timezone'] as string || "";
    const loc = getLocation( locHeader );
    const contactId = req.params.id;

    // console.log( `GET appt for contact ${contactId}` );
		logger.writeLog( 'info', 'getAppointmentsForContact()', `get appt for contact ${contactId}` );

    if( !loc.token ) {
      return res.sendStatus( 401 );
    }

    if( !contactId || contactId.length === 0 ) {
      return res.sendStatus( 400 );
    }

    const resp = await appointmentService.getAppointmentsForContact( contactId, loc.token );

    if( resp.status === 200 ) {
      let appointments: TLPAppointmentData[] = [];
      resp.data.events.forEach( async ( appt: any ) => {
        const found: GHLAppointmentData = {...appt};
        const newTime = formatTime( found.startTime, timezone );
        
        if( newTime === null ) {
          console.log( `unable to format time ${found.startTime} - sending original` );
        }

        found.contactId = contactId;
        found.locationId = loc.location;
        found.startTime = newTime || found.startTime;
        // const ghlAppt = await appointmentService.getAppointment( appt.id, loc.token );

        const tlpAppt = translateApptGHLtoTLP( found );
        appointments.push( tlpAppt );
      } );

      // console.log( appointments );
			logger.writeLog( 'info', 'getAppointment()', `found appointments for contact:${contactId}`, appointments );

      return res.status( resp.status ).json( appointments );
    }

    return res.status( resp.status ).json( resp.data );
  }

  const createAppointment = async ( req: express.Request, res: express.Response ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const calendarId = req.headers['x-tlp-app-calendar'] as string || "";
    const loc = getLocation( locHeader );

    console.log( `post create appointment` );

    const tlpAppt = {...req.body};
    const appt = translateApptTLPtoGHL( tlpAppt, loc.location, calendarId );

    if( !appt ) {
      console.log( `appointment undefined returning 400` );
      return res.sendStatus( 400 );
    }

    if( loc.location && loc.token ) {
      console.log( `creating appointment at GHL` );
      const resp = await appointmentService.createAppointment( appt, loc.token );

      if( resp.status >= 200 && resp.status < 300 ) {
        // convert returned data to tlp
        tlpAppt.ghlApptId = resp.data.id;
        return res.status( resp.status ).json( tlpAppt );
      }

      return res.status( resp.status ).json( resp.data );
    }

    return res.sendStatus( 401 );
  }

  const updateAppointment = async ( req: express.Request, res: express.Response ) => {
    const locHeader = req.headers['x-tlp-app-location'] as string || "";
    const calendarId = req.headers['x-tlp-app-calendar'] as string || "";
    const loc = getLocation( locHeader );

    console.log( `post update appointment` );

    const tlpAppt = {...req.body};
    const appt = translateApptTLPtoGHL( tlpAppt, loc.location, calendarId );

    if( !appt ) {
      return res.sendStatus( 400 );
    }

    if( loc.location && loc.token ) {
      const resp = await appointmentService.updateAppointment( appt, loc.token );
      const tlpAppt = translateApptGHLtoTLP( resp.data );

      return res.status( resp.status ).json( tlpAppt );
    }


    return res.sendStatus( 401 );
  }

  return{
    getAppointment,
    getAppointmentsForContact,
    createAppointment,
    updateAppointment
  }
}

export const apptController = createApptController();