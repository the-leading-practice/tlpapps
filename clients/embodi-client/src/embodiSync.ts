import { embodiService } from 'services/embodi.js';
import { USER, PASS, LOC } from './constants.js';
import { getWeekStartEnd } from 'utils/time.js';
import { printCalendar, Day, Slot } from 'utils/calendar.js';
import registry from 'registry.js';
import { tlpService } from 'services/tlp.js';

const createEmbodiSync = () => {
	const login = async () => {
		if (USER.length === 0 || PASS.length === 0) {
			console.log('cannot run without a valid user or password');
			process.exit(1);
		}

		await embodiService.login(USER, PASS);
		console.log(global.token);
	};

	const sync = async (date: Date) => {
		const week = getWeekStartEnd(date);
		const start = Math.floor(week.start.getTime() / 1000);
		const end = Math.floor(week.end.getTime() / 1000);

		console.log(week.start.toISOString(), start);
		console.log(week.end.toISOString(), end);

		const avail = await embodiService.checkAvailability(start, end, LOC);
		// console.log(avail);

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
			console.log(`available: ${d.toString()}`);
			const idx = days[d.getDay()].slots.findIndex(
				(slot: Slot) => Math.floor(slot.date.getTime() / 1000) === Math.floor(d.getTime() / 1000),
			);
			days[d.getDay()].slots[idx].open = true;
		});

		// return days;
		// post to GHL
		days.forEach((day) => {
			day.slots.forEach((slot) => {
				if (!slot.open) {
					const start = slot.date;
					const end = new Date(
						start.getFullYear(),
						start.getMonth(),
						start.getDate(),
						start.getHours() + 1,
					);
					tlpService.addBlock(start, end);
				}
			});
		});
	};

	return {
		login,
		sync,
	};
};

export const embodiSync = createEmbodiSync();
