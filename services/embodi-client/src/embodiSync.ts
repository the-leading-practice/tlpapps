import { embodiService } from './services/embodi.js';
import { USER, PASS } from './constants.js';
import { getWeekStartEnd } from './utils/time.js';
import { Day, Slot } from './utils/calendar.js';
import { tlpService } from './services/tlp.js';
import { LocationSetting } from './types/types.js';
import logger from './logger.js';

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

	const checkForExistingBlock = async (start: Date, end: Date, location: LocationSetting) => {
		const startTime = start.getTime();
		const resp = await tlpService.getBlock(start, end, location);

		if (resp.status === 200) {
			const json = JSON.parse(resp.data);
			for (const event of json.data.events) {
				const eventStart = new Date(event.startTime).getTime();
				if (eventStart === startTime) {
					return true;
				}
			}
		}

		return false;
	};

	const getAvailability = async (start: Date, end: Date, location: LocationSetting) => {
		const startTime = Math.floor(start.getTime() / 1000);
		const endTime = Math.floor(end.getTime() / 1000);

		logger.writeLog(
			'info',
			`requesting availability for ${location.locationId} ${start.toString()} to ${start.toString()}`,
		);
		logger.writeLog('info', `unix timestamp ${start} to ${end}`);

		const avail = await embodiService.checkAvailability(startTime, endTime, location.locationId);
		console.log(avail);
		if (!avail) {
			logger.writeLog('info', `nothing available for the timeframe requested`);
			return [];
		}

		logger.writeLog('info', `found ${avail.availabilities.length} slots available`);

		const days: Day[] = [];

		console.log(start);
		console.log(end);

		const startIdx = start.getDay();
		const endIdx = end.getDay();
		// console.log(startIdx, start.getDay(), endIdx, end.getDay());
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

			days[x] = { date, slots: [] };

			for (let y = 0; y < 9; ++y) {
				const top = new Date(date);
				const bottom = new Date(date);

				// TODO - this is a hack to get our times to match up
				top.setHours(12 + y);
				bottom.setHours(12 + y);
				bottom.setMinutes(30);

				days[x].slots.push({ date: top, open: false });
				days[x].slots.push({ date: bottom, open: false });
			}
		}

		avail.availabilities.forEach((a: number) => {
			const top: Date = new Date(a * 1000);
			const bottom: Date = new Date(top);
			// console.log(`available: ${top.toString()} ${a}`);

			let saveBottom = false;

			if (top.getMinutes() === 0) {
				bottom.setMinutes(30);
				saveBottom = true;
			}

			const idx = days[top.getDay()].slots.findIndex(
				(slot: Slot) => Math.floor(slot.date.getTime() / 1000) === Math.floor(top.getTime() / 1000),
			);

			if (days[top.getDay()].slots[idx]) {
				days[top.getDay()].slots[idx].open = true;
			}

			// block an hour
			if (saveBottom) {
				const bottomIdx = days[bottom.getDay()].slots.findIndex(
					(slot: Slot) =>
						Math.floor(slot.date.getTime() / 1000) === Math.floor(bottom.getTime() / 1000),
				);

				if (days[bottom.getDay()].slots[bottomIdx]) {
					days[bottom.getDay()].slots[bottomIdx].open = true;
				}
			}
		});

		return days;
	};

	const getWeekAvailability = async (date: Date, location: LocationSetting) => {
		const week = getWeekStartEnd(date);
		return getAvailability(week.start, week.end, location);
	};

	const updateGHL = async (days: Day[], location: LocationSetting) => {
		// make sure login is good
		const now = new Date();
		if (now.getTime() - location.updated.getTime() >= location.config.TokenRefreshMilliseconds) {
			const resp = await tlpService.login(location.locationId, location.secret);
			location.token = resp.token;
			location.config = resp.config;
			location.updated = now;
		}

		for (const day of days) {
			if (!day || !day.slots) continue;
			for (const slot of day.slots) {
				if (!slot.open) {
					const start = slot.date;
					const end = new Date(
						start.getFullYear(),
						start.getMonth(),
						start.getDate(),
						start.getHours(),
					);

					if (start.getMinutes() === 0) {
						end.setMinutes(30);
					} else {
						end.setHours(end.getHours() + 1);
						end.setMinutes(0);
					}

					// check for existing block for this location
					const isBlocked = await checkForExistingBlock(start, end, location);
					if (isBlocked) {
						logger.writeLog(
							'info',
							`block already exists for this slot: ${start.toISOString()} ${end.toISOString()}`,
						);

						continue;
					}

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
				}
			}
		}
	};

	const sync = async (date: Date, location: LocationSetting) => {
		const days = await getWeekAvailability(date, location);

		// post to GHL
		if (days && days.length > 0) {
			await updateGHL(days, location);
		}
	};

	const syncRange = async (start: Date, end: Date, location: LocationSetting) => {
		const days = await getAvailability(start, end, location);

		// post to GHL
		if (days && days.length > 0) {
			await updateGHL(days, location);
		}
	};

	return {
		login,
		sync,
		syncRange,
	};
};

export const embodiSync = createEmbodiSync();
