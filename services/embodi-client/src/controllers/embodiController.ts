import { embodiSync } from '../embodiSync.js';
import express from 'express';
import logger from '../logger.js';
import registry from '../registry.js';
import { embodiService } from '../services/embodi.js';
import { LocationSetting } from '../types/types.js';
import { tlpService } from '../services/tlp.js';

const createEmbodiController = () => {
	const index = async (req: express.Request, res: express.Response) => {
		res.status(200).json({ status: 'ok' });
	};

	const getAvailability = async (req: express.Request, res: express.Response) => {
		// request availability for the desired location and date
		res.status(200).json({ status: 'ok' });
	};

	const createAppointment = async (req: express.Request, res: express.Response) => {
		const data = { ...req.body };
		res.send(200);

		// send message to embodi
		const start = new Date(data.appointment.startTime);
		const end = new Date(data.appointment.endTime);

		logger.writeLog(
			'info',
			`sending start: ${Math.floor(start.getTime() / 1000)}, end: ${Math.floor(end.getTime() / 1000)}, contactId: ${data.appointment.contactId} to embodi`,
		);

		const locations: LocationSetting[] = registry.get('locations');
		const loc = locations.find((l: LocationSetting) => l.locationId === data.locationId);

		await embodiSync.login();
		const resp = await embodiService.scheduleAppointment(
			Math.floor(start.getTime() / 1000),
			Math.floor(end.getTime() / 1000),
			data.appointment.contactId,
		);

		// if failed post notification
		if (resp && resp.status === 409) {
			const msg = {
				severity: 'Error',
				timestamp: new Date().toISOString(),
				message: `unable to schedule appointment with EMBODI timeslot no longer available\n**ID**: ${data.appointment.id}\n**Contact**: ${data.appointment.contactId}\n**Start Time**: ${data.appointment.startTime}\n**End Time**: ${data.appointment.endTime}`,
			};

			if (loc) {
				await tlpService.postNotification(msg, loc);
			}

			// send failure notice to the notification service
			logger.writeLog('error', 'unable to schedule appointment with embodi');
		}
	};

	const updateCalendar = async (req: express.Request, res: express.Response) => {
		const data = { ...req.body };
		const start = new Date(data.start * 1000);

		const locations: LocationSetting[] = registry.get('locations');
		const loc = locations.find((l: LocationSetting) => l.locationId === data.locationId);

		if (loc) {
			res.status(200);
		} else {
			res.status(404).json({
				message: 'unknown location',
			});
		}
		res.send();

		if (loc) {
			await embodiSync.login();
			await embodiSync.sync(start, loc);
		}
	};

	return {
		index,
		getAvailability,
		createAppointment,
		updateCalendar,
	};
};

export const embodiController = createEmbodiController();
