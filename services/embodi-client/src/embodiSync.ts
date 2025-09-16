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

	const getAvailability = async (date: Date, location: LocationSetting) => {
		const week = getWeekStartEnd(date);
		const start = Math.floor(week.start.getTime() / 1000);
		const end = Math.floor(week.end.getTime() / 1000);

		logger.writeLog(
			'info',
			`requesting availability for ${location.locationId} ${week.start.toString()} to ${week.start.toString()}`,
		);
		logger.writeLog('info', `unix timestamp ${start} to ${end}`);
		// console.log(week.start.toISOString(), start);
		// console.log(week.end.toISOString(), end);

		const avail = await embodiService.checkAvailability(start, end, location.locationId);
		console.log(avail);
		if (!avail) {
			logger.writeLog('info', `nothing available for the timeframe requested`);
			return [];
		}

		logger.writeLog('info', `found ${avail.availabilities.length} slots available`);

		const days: Day[] = [];

		for (let x = 0; x < 7; ++x) {
			const date = new Date(
				week.start.getFullYear(),
				week.start.getMonth(),
				week.start.getDate() + x,
				8,
				0,
				0,
			);

			days[x] = { date, slots: [] };

			for (let y = 0; y < 9; ++y) {
				const top = new Date(date);
				const bottom = new Date(date);

				top.setHours(8 + y);
				bottom.setHours(8 + y);
				bottom.setMinutes(30);

				days[x].slots.push({ date: top, open: false });
				days[x].slots.push({ date: bottom, open: false });
			}
		}

		avail.availabilities.forEach((a: number) => {
			const d = new Date(a * 1000);
			// console.log(`available: ${d.toString()}`);
			const idx = days[d.getDay()].slots.findIndex(
				(slot: Slot) => Math.floor(slot.date.getTime() / 1000) === Math.floor(d.getTime() / 1000),
			);

			if (days[d.getDay()].slots[idx]) {
				days[d.getDay()].slots[idx].open = true;
			}
		});

		return days;
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
			for (const slot of day.slots) {
				if (!slot.open) {
					const start = slot.date;
					const end = new Date(
						start.getFullYear(),
						start.getMonth(),
						start.getDate(),
						start.getHours() + 1,
					);

					// check for existing block for this location
					const block = await tlpService.getBlock(start, end, location);

					if (block.status === 200) {
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
		const days = await getAvailability(date, location);

		// post to GHL
		if (days && days.length > 0) {
			await updateGHL(days, location);
		}
	};

	return {
		login,
		sync,
	};
};

export const embodiSync = createEmbodiSync();
