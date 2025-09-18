import { embodiService } from './services/embodi.js';
import { USER, PASS } from './constants.js';
import { getWeekStartEnd } from './utils/time.js';
import { tlpService } from './services/tlp.js';
import { LocationSetting, Slot, Dictionary } from './types/types.js';
import logger from './logger.js';
import getConfig from './config.js';

const createEmbodiSync = () => {
	const login = async () => {
		if (USER.length === 0 || PASS.length === 0) {
			logger.writeLog('error', 'cannot run without a valid user or password');
			process.exit(1);
		}

		await embodiService.login(USER, PASS);
		if (global.token.length > 0) {
			logger.writeLog('info', 'received token from embodi');
		}
		// console.log(global.token);
	};

	const getAvailability = async (start: Date, end: Date, location: LocationSetting) => {
		const startTime = Math.floor(start.getTime() / 1000);
		const endTime = Math.floor(end.getTime() / 1000);
		const config = getConfig();

		logger.writeLog(
			'info',
			`requesting availability for ${location.locationId} ${start.toString()} to ${start.toString()}`,
		);
		logger.writeLog('info', `unix timestamp ${start} to ${end}`);

		// get available slots from embodi
		const avail = await embodiService.checkAvailability(startTime, endTime, location.locationId);
		console.log(avail);
		if (!avail) {
			logger.writeLog('info', `nothing available for the timeframe requested`);
			return [];
		}

		logger.writeLog('info', `found ${avail.availabilities.length} slots available`);

		// get existing blocks from GHL
		logger.writeLog('info', `requesting existing blocks for same timeframe`);
		const blkResp = await tlpService.getBlock(start, end, location);
		const blocks = JSON.parse(blkResp.data);
		if (blkResp.status !== 200) {
			logger.writeLog(`warn`, 'there was an error pulling blocks from GHL');
		}

		// console.log(start);
		// console.log(end);

		const startIdx = start.getDay();
		const endIdx = end.getDay();

		const slots: Dictionary<Slot> = {};

		for (let x = startIdx; x <= endIdx; ++x) {
			const offset = startIdx === 0 && endIdx === 6 ? x : endIdx - x;
			const date = new Date(
				start.getFullYear(),
				start.getMonth(),
				start.getDate() + offset,
				8,
				0,
				0,
			);

			for (let y = 0; y < config.hoursToSync; ++y) {
				const top = new Date(date);
				top.setHours(12 + y); // TODO - this is a hack to get our times to match up

				const bottom = new Date(top);
				bottom.setMinutes(30);

				const topTime = Math.floor(top.getTime() / 1000);
				const bottomTime = Math.floor(bottom.getTime() / 1000);

				slots[topTime] = { date: top, blocked: false, open: false, eventId: '' };
				slots[bottomTime] = { date: bottom, blocked: false, open: false, eventId: '' };
			}
		}

		// filter available slots
		avail.availabilities.forEach((a: number) => {
			const top: Date = new Date(a * 1000);
			const bottom: Date = new Date(top);
			let saveBottom = false;
			// console.log(`available: ${top.toString()} ${a}`);

			if (top.getMinutes() === 0) {
				bottom.setMinutes(30);
			} else {
				bottom.setHours(bottom.getHours() + 1);
				bottom.setMinutes(0);
			}

			if (avail.duration > 30) saveBottom = true;

			const topTime = Math.floor(top.getTime() / 1000);
			if (slots[topTime]) {
				slots[topTime].open = true;
			}

			// block an hour
			if (saveBottom) {
				const bottomTime = Math.floor(bottom.getTime() / 1000);
				if (slots[bottomTime]) {
					slots[bottomTime].open = true;
				}
			}
		});

		// filter out already blocked slots
		for (const event of blocks.data.events) {
			const eventStart = Math.floor(new Date(event.startTime).getTime() / 1000);
			if (slots[eventStart]) {
				slots[eventStart].blocked = true;
				slots[eventStart].eventId = event.id;
			}
		}

		return slots;
	};

	const getWeekAvailability = async (date: Date, location: LocationSetting) => {
		const week = getWeekStartEnd(date);
		return getAvailability(week.start, week.end, location);
	};

	const updateGHL = async (slots: any, location: LocationSetting) => {
		// make sure login is good
		const now = new Date();
		if (now.getTime() - location.updated.getTime() >= location.config.TokenRefreshMilliseconds) {
			const resp = await tlpService.login(location.locationId, location.secret);
			location.token = resp.token;
			location.config = resp.config;
			location.updated = now;
		}

		const keys = Object.keys(slots);
		for (const key of keys) {
			const slot = slots[key];
			const start = slot.date;
			const end = new Date(start);

			if (start.getMinutes() === 0) {
				end.setMinutes(30);
			} else {
				end.setHours(end.getHours() + 1);
				end.setMinutes(0);
			}

			// we need to block this slot off
			if (!slot.blocked && !slot.open) {
				const resp = await tlpService.addBlock(start, end, location);

				if (resp.status >= 200 && resp.status <= 300) {
					logger.writeLog(
						'info',
						`added block to calendar: ${start.toISOString()} ${end.toISOString()}`,
					);
				} else {
					logger.writeLog(
						'error',
						`failed to add block to calendar: ${start.toISOString()} ${end.toISOString()}`,
					);
				}
				continue;
			}

			// this slot is now available - delete block
			if (slot.blocked && slot.open) {
				const resp = await tlpService.deleteBlock(slot.eventId, location);
				if (resp.status === 200) {
					logger.writeLog(
						'info',
						`deleted block from calendar ${start.toISOString()} ${slot.eventId}`,
					);
				} else {
					logger.writeLog(
						'error',
						`error deleting block from calendar ${start.toISOString()} ${slot.eventId} ${resp.data}`,
					);
				}
			}
		}
	};

	const sync = async (date: Date, location: LocationSetting) => {
		const slots = await getWeekAvailability(date, location);
		await updateGHL(slots, location);
	};

	const syncRange = async (start: Date, end: Date, location: LocationSetting) => {
		const slots = await getAvailability(start, end, location);
		await updateGHL(slots, location);
	};

	return {
		login,
		sync,
		syncRange,
	};
};

export const embodiSync = createEmbodiSync();
