/**
 * GHL Calendar controller.
 * Ported from ghl-service/src/controllers/calendar.ts.
 */
import express from 'express';
import { logger } from './loggerAdapter.js';
import { formatTime, getLocation } from './utils.js';
import type { GHLCalendarBlock } from './types.js';
import { appointmentGHLService } from './services.js';

const createCalendarController = () => {
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

			const resp = await appointmentGHLService.createCalendarBlock(block, loc.token);
			console.log(resp);
			if (resp.status >= 200 && resp.status < 300) {
				logger.writeLog('info', 'createBlock()', `successfully created block ${resp.data.id}`);
			}

			return res.status(resp.status).json({ data: resp.data });
		}

		return res.sendStatus(401);
	};

	const getBlocks = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const calendarId = (req.headers['x-tlp-app-calendar'] as string) || '';
		const loc = getLocation(locHeader);

		const startTime = req.query.startTime as string;
		const endTime = req.query.endTime as string;

		if (loc && loc.location) {
			const resp = await appointmentGHLService.getCalendarBlocks(
				startTime,
				endTime,
				loc.location,
				calendarId,
				loc.token,
			);
			return res.status(resp.status).json({ data: resp.data });
		}

		return res.status(200).json({ data: [] });
	};

	const deleteBlock = async (req: express.Request, res: express.Response) => {
		const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
		const loc = getLocation(locHeader);

		const eventId = req.query.eventId as string;

		if (loc && loc.token) {
			const resp = await appointmentGHLService.deleteCalendarBlock(eventId, loc.token);
			return res.sendStatus(resp.status);
		}

		return res.sendStatus(200);
	};

	return {
		getCalendars,
		createBlock,
		getBlocks,
		deleteBlock,
	};
};

export const calendarController = createCalendarController();
