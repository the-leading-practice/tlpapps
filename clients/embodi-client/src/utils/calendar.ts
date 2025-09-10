import {
	ltCorner,
	rtCorner,
	lbCorner,
	rbCorner,
	horiz,
	vert,
	horizT,
	horizBT,
	vertLT,
	vertRT,
	horizLine,
	cross,
	green,
	yellow,
} from './cli.js';

export type Slot = {
	date: Date;
	open: boolean;
};

export type Day = {
	date: Date;
	slots: Slot[];
};

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const printCalendar = (week: Day[], workWeek: boolean = true) => {
	const days: string[] = [''];
	const start = workWeek ? 1 : 0;
	const length = workWeek ? week.length - 1 : week.length;

	console.log(printTopRow(length));

	for (let x = start; x < length; ++x) {
		const idx = workWeek ? x : x + 1;
		days[idx] = `${daysOfWeek[week[x].date.getDay()]} ${week[x].date.getDate()}`;
	}

	console.log(printRow(days));

	for (let x = 0; x < week[start].slots.length; x++) {
		const line: string[] = [
			`${week[start].slots[x].date.getHours().toString().padStart(2, '0')}:${week[start].slots[x].date.getMinutes().toString().padStart(2, '0')}`,
		];
		for (let y = start; y < length; ++y) {
			const idx = workWeek ? y : y + 1;

			const status = week[y].slots[x].open;
			line[idx] = status.toString();
		}

		console.log(printRow(line, x < 17));
	}

	console.log(printBottomRow(length));
};

const printTopRow = (length: number) => {
	let topRow = ltCorner;
	for (let x = 0; x < length; ++x) {
		topRow += horizLine(15);

		if (x < length - 1) {
			topRow += horizT;
		}
	}
	topRow += rtCorner;
	return topRow;
};

const printBottomRow = (length: number) => {
	let bottomRow = lbCorner;
	for (let x = 0; x < length; ++x) {
		bottomRow += horizLine(15);

		if (x < length - 1) {
			bottomRow += horizBT;
		}
	}

	bottomRow += rbCorner;
	return bottomRow;
};

const printRow = (data: string[], printLine: boolean = true) => {
	let row = vert;

	for (let x = 0; x < data.length; ++x) {
		if (data[x] === 'false') row += yellow(data[x].padEnd(15, ' '));
		else if (data[x] === 'true') row += green(data[x].padEnd(15, ' '));
		else row += data[x].padEnd(15, ' ');
		row += vert;
	}

	if (printLine) {
		row += '\n' + vertLT;
		for (let x = 0; x < data.length; ++x) {
			row += horizLine(15);

			if (x < data.length - 1) {
				row += cross;
			} else {
				row += vertRT;
			}
		}
	}

	return row;
};
