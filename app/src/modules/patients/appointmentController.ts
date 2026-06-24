/**
 * Appointment controller.
 * Ported from patient-service/src/controllers/appointmentController.ts.
 */
import express from 'express';
import { appointmentDataService } from './services.js';
import { integrationService } from '../integration/services.js';
import { generateAppointment, getLocation, getLocationSettings } from './utils.js';
import { logger } from './loggerAdapter.js';

const createController = () => {
	const appointments = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const loc = getLocation(locHeader);

		const ret = await appointmentDataService.getAppointments(loc.location);

		res.status(200).json(ret);
	};

	const appointment = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const loc = getLocation(locHeader);

		const eventId = req.params.id as string;
		const ret = await appointmentDataService.getAppointment(loc.location, parseInt(eventId));

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
			const currDate = new Date().getTime();

			// Per-batch cache of calendarId -> assignedUserId (teamMembers[0].userId).
			// Breaks become GHL block-slots placed on the assigned user's calendar;
			// resolve once per calendar to avoid a GHL round-trip per break.
			const assignedUserCache = new Map<string, string | null>();
			const resolveAssignedUser = async (calendarId: string): Promise<string | null> => {
				if (assignedUserCache.has(calendarId)) {
					return assignedUserCache.get(calendarId) ?? null;
				}
				let userId: string | null = null;
				try {
					const calResp: any = await integrationService.getCalendar(calendarId, jwt);
					if (calResp.status >= 200 && calResp.status < 300) {
						const cal = calResp.data?.calendar ?? calResp.data;
						userId = cal?.teamMembers?.[0]?.userId ?? null;
					}
				} catch (err: any) {
					logger.writeLog('warn', `failed to fetch calendar ${calendarId}: ${err?.message ?? err}`);
				}
				assignedUserCache.set(calendarId, userId);
				return userId;
			};

			// BIDI-02: process each appointment via this helper, then run them with
			// bounded concurrency so a 90-day window doesn't serialize hundreds of
			// sequential GHL round-trips. `continue` becomes `return` inside the helper.
			const processOne = async (appt: any) => {
				logger.writeLog(
					'debug',
					`processing ${appt.apptId} status: ${appt.apptStatus} start time: ${appt.apptTime}`,
				);

				// if push ghl is false - we don't write anything to GHL
				if (!pushGHL || !pushAppt) {
					logger.writeLog('debug', `no push header found - eating data`);
					resp.success.push({ apptId: appt.apptId });
					return;
				}

				// make sure we have all the needed info
				if (appt.patientId === undefined || appt.apptId === undefined) {
					resp.fail.push({
						apptId: appt.apptId,
						status: 400,
						message: 'bad requeset - patient id or appointment id missing',
					});
					return;
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
					return;
				}

				// Break / blocked time: DrChrono `appt_is_break` slots have no patient and
				// must become a GHL blocked-time slot, not a contact appointment.
				if (appt.isBreak) {
					if (!isFuture) {
						resp.success.push({ apptId: appt.apptId });
						return;
					}

					// Dedup: cron re-runs every 15 min. If we already created a block for
					// this break (mapping has a ghlApptId), skip — treat as success.
					const existing = await appointmentDataService.getAppointment(
						loc.location,
						appt.apptId,
					);
					if (existing && existing.ghlApptId && existing.ghlApptId.length > 0) {
						logger.writeLog('debug', `block already exists for break ${appt.apptId}, skipping`);
						resp.success.push({ apptId: appt.apptId });
						return;
					}

					// block-slots needs assignedUserId from the target calendar's teamMembers.
					const assignedUserId = await resolveAssignedUser(tlpAppt.calendarId);
					if (!assignedUserId) {
						logger.writeLog(
							'warn',
							`no teamMembers/userId on calendar ${tlpAppt.calendarId}; skipping block for break ${appt.apptId}`,
						);
						resp.success.push({ apptId: appt.apptId });
						return;
					}

					const durMin =
						typeof appt.durationMinutes === 'number' && appt.durationMinutes > 0
							? appt.durationMinutes
							: 60;
					const endTime = new Date(
						new Date(tlpAppt.startTime).getTime() + durMin * 60_000,
					).toISOString();
					const title = (appt.reason && String(appt.reason).trim()) || 'Blocked';
					const blockResp = await integrationService.createBlock(
						{
							locationId: loc.location,
							startTime: tlpAppt.startTime,
							endTime,
							assignedUserId,
							title,
						},
						jwt,
					);
					if (blockResp.status >= 200 && blockResp.status < 300) {
						logger.writeLog('debug', `created GHL blocked time for break ${appt.apptId}`);
						// Persist a dedup mapping keyed by the DrChrono break apptId. Reuse the
						// appointments store; patientId/contactId are sentinels (no patient on a break).
						const blockId = (blockResp.data as any)?.id ?? '';
						if (blockId) {
							await appointmentDataService.upsertAppointment({
								apptId: appt.apptId,
								patientId: 0,
								contactId: 'BLOCK',
								ghlApptId: blockId,
								locationId: loc.location,
								calendarId: tlpAppt.calendarId,
								startTime: tlpAppt.startTime,
								status: 'block',
							});
						}
						resp.success.push({ apptId: appt.apptId });
					} else {
						logger.writeLog(
							'warn',
							`error creating blocked time ${blockResp.status}: ${blockResp.data}`,
						);
						resp.fail.push({ apptId: appt.apptId, msg: 'failed to create blocked time' });
					}
					return;
				}

				if (!tlpAppt.contactId || tlpAppt.contactId?.length <= 0) {
					logger.writeLog('warn', `we don't have a contactId for this request ${tlpAppt.apptId}`);
					resp.success.push({ apptId: appt.apptId });
					return;
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

					await appointmentDataService.upsertAppointment(tlpAppt);
					resp.success.push({ apptId: appt.apptId });
				} else if (apptResp) {
					logger.writeLog('warn', `error saving appointment ${apptResp.status}: ${apptResp.data}`);
					resp.fail.push({ apptId: appt.apptId, msg: 'failed to save appointment' });
				}
			};

			const CONCURRENCY = 6;
			for (let i = 0; i < reqData.appointments.length; i += CONCURRENCY) {
				const chunk = reqData.appointments.slice(i, i + CONCURRENCY);
				// Isolate each appointment: one bad record (e.g. a recurring-instance with a
				// non-numeric composite id) must not reject the whole batch / 500 the request.
				await Promise.all(
					chunk.map((appt: any) =>
						processOne(appt).catch((err: any) => {
							logger.writeLog(
								'warn',
								`appointment ${appt?.apptId} failed: ${err?.message ?? err}`,
							);
							resp.fail.push({ apptId: appt?.apptId, msg: 'exception' });
						}),
					),
				);
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
		console.log(req.params.id as string);
		res.status(200);
	};

	const deleteAppt = async (req: express.Request, res: express.Response) => {
		const id = req.params.id as string;
		const ids = id.split(',');

		if (ids.length > 1) {
			console.log(`id array from query: `);
			ids.forEach((i: string) => console.log(`  id: ${i}`));
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
