import express from 'express';
import { logger } from '../logger.js';
import { formatTime, getLocation } from '../utils/common.js';
import { GHLCalendarBlock } from '../types/common.js';
import { appointmentService } from '../services/appointment.js';

const createCalendarControler = () => {
	const getCalendars = () => {};

	const createBlock = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const timezone = (req.headers['x-tlp-app-timezone'] as string) || '';
		const calendarId = (req.headers['x-tlp-app-calendar'] as string) || '';
		const loc = getLocation(locHeader);

		logger.writeLog('info', 'createBlock()', `request to create slot block`);

		const slot = { ...req.body };
		if (loc.location && loc.token) {
			const block: GHLCalendarBlock = {
				calendarId: calendarId,
				locationId: loc.location,
				startTime: formatTime(slot.start, timezone) || slot.start,
				endTime: formatTime(slot.end, timezone) || slot.end,
			};

			const resp = await appointmentService.createCalendarBlock(block, loc.token);
			console.log(resp);
			if (resp.status >= 200 && resp.status < 300) {
				logger.writeLog('info', 'createBlock()', `successfully created block ${resp.data.id}`);
			}

			return res.status(resp.status).json({ data: resp.data });
		}

		return res.sendStatus(401);
	};

	const getBlockedSlots = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const calendarId = (req.headers['x-tlp-app-calendar'] as string) || '';
		const loc = getLocation(locHeader);

		const startTime = req.params.startTime;
		const endTime = req.params.endTime;

		if (loc && loc.location) {
			const resp = await appointmentService.getCalendarBlocks(
				startTime,
				endTime,
				loc.location,
				calendarId,
				loc.token,
			);
			return res.sendStatus(resp.status).json(resp.data);
		}

		return res.sendStatus(200).json([]);
	};

	return {
		getCalendars,
		createBlock,
		getBlockedSlots,
	};
};

export const calendarController = createCalendarControler();
