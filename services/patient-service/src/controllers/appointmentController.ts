import express from 'express';
import { appointmentService } from '../services/appointment.js';
import { integrationService } from '../services/integration.js';
import { generateAppointment } from '../utils/appointmentUtils.js';
import { getLocation, getLocationSettings } from '../utils/common.js';
import { logger } from '../logger.js';

const createController = () => {
	const appointments = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const loc = getLocation(locHeader);

		const ret = await appointmentService.getAppointments(loc.location);

		res.status(200).json(ret);
	};

	const appointment = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const loc = getLocation(locHeader);

		const eventId = req.params.id;
		const ret = await appointmentService.getAppointment(loc.location, parseInt(eventId));

		res.status(200).json(ret);
	};

	// TODO - refactor this whole thing
	const createAppointments = async (req: express.Request, res: express.Response) => {
		const settings = getLocationSettings(req.headers);
		const { locHeader, jwt, pushGHL, pushAppt, software } = settings;
		const loc = getLocation(locHeader);

		const reqData = { ...req.body };

		const resp: any = {};
		resp.success = [];
		resp.fail = [];

		if (!reqData || !reqData.appointments) {
			logger.writeLog('warn', `no usable data found`);
			return res.sendStatus(400);
		}

		logger.writeLog(
			'debug',
			`${loc.location} processing ${reqData.appointments.length} appointments...`,
		);
		if (reqData && reqData.appointments.length > 0) {
			//let idx = 0;
			const currDate = new Date().getTime();

			for (const appt of reqData.appointments) {
				logger.writeLog(
					'debug',
					`processing ${appt.apptId} status: ${appt.apptStatus} start time: ${appt.apptTime}`,
				);

				// if push ghl is false - we don't write anything to GHL
				if (!pushGHL || !pushAppt) {
					logger.writeLog('debug', `no push header found - eating data`);
					resp.success.push({ apptId: appt.apptId });

					continue;
				}

				// make sure we have all the needed info
				if (appt.patientId === undefined || appt.apptId === undefined) {
					resp.fail.push({
						apptId: appt.apptId,
						status: 400,
						message: 'bad requeset - patient id or appointment id missing',
					});

					continue;
				}

				const tlpAppt = await generateAppointment(appt, settings, software);

				// is this in the future
				let isFuture = true;
				if (new Date(tlpAppt.startTime).getTime() < currDate) {
					isFuture = false;
				}

				// check for patient mapping - if contactId is empty - return with error
				if (!tlpAppt.calendarId || tlpAppt.calendarId.length === 0) {
					logger.writeLog(
						'warn',
						`we don't have a calendarId for this request - we will have to ignore all appointments`,
					);
					resp.success.push({ apptId: appt.apptId });
					continue;
				}

				if (!tlpAppt.contactId || tlpAppt.contactId?.length <= 0) {
					logger.writeLog('warn', `we don't have a contactId for this request ${tlpAppt.apptId}`);
					resp.success.push({ apptId: appt.apptId });
					continue;
				}

				let apptResp;
				// do we have a ghlapptid
				if (tlpAppt.ghlApptId && tlpAppt.ghlApptId.length > 0) {
					// update
					logger.writeLog('debug', `updating appointment ${tlpAppt.apptId} ${tlpAppt.ghlApptId}`);
					logger.writeLog('debug', JSON.stringify(tlpAppt));
					apptResp = await integrationService.updateAppointment(tlpAppt, jwt);
				} else {
					// create
					if (isFuture) {
						logger.writeLog('debug', `creating appointment ${tlpAppt.apptId}`);
						logger.writeLog('debug', JSON.stringify(tlpAppt));
						apptResp = await integrationService.createAppointment(tlpAppt, jwt);
					}
				}

				if (apptResp && apptResp.status < 300) {
					// add mapping
					logger.writeLog('debug', `pushing mapping for ${appt.apptId}`);
					tlpAppt.ghlApptId = apptResp.data.ghlApptId;

					await appointmentService.upsertAppointment(tlpAppt);
					resp.success.push({ apptId: appt.apptId });
				} else if (apptResp) {
					logger.writeLog('warn', `error saving appointment ${apptResp.status}: ${apptResp.data}`);
					// return res.sendStatus( apptResp.status );
					resp.fail.push({ apptId: appt.apptId, msg: 'failed to save appointment' });
					// resp.success.push( {apptId: appt.apptId} );
				}

				//idx++;
			}
		}

		let retStatus = 200;
		resp.status = 'success';
		resp.message = `${resp.success.length} records succeeded, ${resp.fail.length} records failed`;

		logger.writeLog(
			'debug',
			`${resp.success.length} records succeeded, ${resp.fail.length} records failed`,
		);
		console.log(`${resp.success.length} records succeeded, ${resp.fail.length} records failed`);

		if (resp.success.length <= 0) {
			// no valid records
			resp.message = 'no valid records';
			retStatus = 400;
		}

		if (reqData.rquid) {
			resp.rquid = reqData.rquid;
		}

		// store date and time
		return res.status(retStatus).json(resp);
	};

	const updateAppointments = async (req: express.Request, res: express.Response) => {
		console.log(req.params.id);
		// let ret = await appointmentService.getAppointment( parseInt( req.params.id ) );
		res.status(200);
	};

	const deleteAppt = async (req: express.Request, res: express.Response) => {
		const id = req.params.id;
		const ids = id.split(',');

		if (ids.length > 1) {
			console.log(`id array from query: `);
			ids.forEach((i) => console.log(`  id: ${i}`));
		} else console.log(`id from query: ${id}`);

		// TODO - mark the record as inactive here

		return res.sendStatus(200);
	};

	return {
		appointment,
		appointments,
		createAppointments,
		updateAppointments,
		deleteAppt,
	};
};

export const appointmentController = createController();
