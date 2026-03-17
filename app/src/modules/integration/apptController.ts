/**
 * GHL Appointment controller.
 * Ported from ghl-service/src/controllers/appt.ts.
 */
import express from 'express';
import { getLocation, formatTime, translateApptGHLtoTLP, translateApptTLPtoGHL } from './utils.js';
import { appointmentGHLService } from './services.js';
import type { GHLAppointmentData, TLPAppointmentData } from './types.js';
import { logger } from './loggerAdapter.js';

const createApptController = () => {
	const getAppointment = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const timezone = (req.headers['x-tlp-app-timezone'] as string) || '';
		const calendarId = (req.headers['x-tlp-app-calendar'] as string) || '';
		const loc = getLocation(locHeader);
		const eventId = req.params.id;

		logger.writeLog('info', 'getAppointment()', `request to get appointment ${eventId}`);

		if (loc.location && loc.token) {
			const resp = await appointmentGHLService.getAppointment(eventId, loc.token);

			if (resp.status === 200) {
				const appointment = translateApptGHLtoTLP(resp.data);
				const newTime = formatTime(appointment.startTime, timezone);

				if (newTime === null) {
					logger.writeLog(
						'warn',
						'getAppointment()',
						`unable to format time for appointment ${eventId} time:${appointment.startTime} - sending original`,
					);
				}
				appointment.startTime = newTime || appointment.startTime;

				logger.writeLog(
					'info',
					'getAppointment()',
					`found appointment for ${eventId}`,
					appointment,
				);

				return res.status(resp.status).json(appointment);
			}

			return res.status(resp.status).json(resp.data);
		}

		return res.sendStatus(401);
	};

	const getContactAppointments = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const timezone = (req.headers['x-tlp-app-timezone'] as string) || '';
		const loc = getLocation(locHeader);
		const contactId = req.params.id;

		logger.writeLog('info', 'getAppointmentsForContact()', `get appt for contact ${contactId}`);

		if (!loc.token) {
			return res.sendStatus(401);
		}

		if (!contactId || contactId.length === 0) {
			return res.sendStatus(400);
		}

		const resp = await appointmentGHLService.getAppointmentsForContact(contactId, loc.token);

		if (resp.status === 200) {
			const appointments: TLPAppointmentData[] = [];
			resp.data.events.forEach(async (appt: any) => {
				const found: GHLAppointmentData = { ...appt };
				const newTime = formatTime(found.startTime, timezone);

				if (newTime === null) {
					console.log(`unable to format time ${found.startTime} - sending original`);
				}

				found.contactId = contactId;
				found.locationId = loc.location;
				found.startTime = newTime || found.startTime;

				const tlpAppt = translateApptGHLtoTLP(found);
				appointments.push(tlpAppt);
			});

			logger.writeLog(
				'info',
				'getAppointment()',
				`found appointments for contact:${contactId}`,
				appointments,
			);

			return res.status(resp.status).json(appointments);
		}

		return res.status(resp.status).json(resp.data);
	};

	const createAppointment = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const calendarId = (req.headers['x-tlp-app-calendar'] as string) || '';
		const loc = getLocation(locHeader);

		console.log(`post create appointment`);

		const tlpAppt = { ...req.body };
		const appt = translateApptTLPtoGHL(tlpAppt, loc.location, calendarId);

		if (!appt) {
			console.log(`appointment undefined returning 400`);
			return res.sendStatus(400);
		}

		if (loc.location && loc.token) {
			console.log(`creating appointment at GHL`);
			const resp = await appointmentGHLService.createAppointment(appt, loc.token);

			if (resp.status >= 200 && resp.status < 300) {
				// convert returned data to tlp
				tlpAppt.ghlApptId = resp.data.id;
				return res.status(resp.status).json(tlpAppt);
			}

			return res.status(resp.status).json(resp.data);
		}

		return res.sendStatus(401);
	};

	const updateAppointment = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const calendarId = (req.headers['x-tlp-app-calendar'] as string) || '';
		const loc = getLocation(locHeader);

		console.log(`post update appointment`);

		const tlpAppt = { ...req.body };
		const appt = translateApptTLPtoGHL(tlpAppt, loc.location, calendarId);

		if (!appt) {
			return res.sendStatus(400);
		}

		if (loc.location && loc.token) {
			const resp = await appointmentGHLService.updateAppointment(appt, loc.token);
			const translated = translateApptGHLtoTLP(resp.data);

			return res.status(resp.status).json(translated);
		}

		return res.sendStatus(401);
	};

	return {
		getAppointment,
		getContactAppointments,
		createAppointment,
		updateAppointment,
	};
};

export const apptController = createApptController();
