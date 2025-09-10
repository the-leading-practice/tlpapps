import express from 'express';
import { logger } from '../logger.js';
import { formatTime, getLocation } from '../utils/common.js';
import { GHLCalendarBlock } from 'types/common.js';
import { appointmentService } from 'services/appointment.js';

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
				endTime: formatTime(slot.start, timezone) || slot.end,
			};

			const resp = await appointmentService.createCalendarBlock(block, loc.token);

			if (resp.status >= 200 && resp.status < 300) {
				// convert returned data to tlp
				logger.writeLog('info', 'createBlock()', `successfully created block ${resp.data.id}`);
			}

			return res.status(resp.status).json(resp.data);
		}

		return res.sendStatus(401);
	};

	return {
		getCalendars,
		createBlock,
	};
};

export const calendarController = createCalendarControler();
