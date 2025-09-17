export const getWeekStartEnd = (start: Date) => {
	// back up to sunday
	const sunday = new Date(
		start.getFullYear(),
		start.getMonth(),
		start.getDate() - start.getDay(),
		8,
		0,
		0,
	);

	// go forward to saturday
	const saturday = new Date(
		start.getFullYear(),
		start.getMonth(),
		start.getDate() + (6 - start.getDay()),
		17,
		0,
		0,
	);

	return {
		start: sunday,
		end: saturday,
	};
};

export const getCurrentOffset = (time: string, timeZone: string) => {
	// Create the formatter with the desired options.
	const format = new Intl.DateTimeFormat('en', {
		timeZone,
		timeZoneName: 'longOffset',
	});

	// Get the time zone name component, and slice off any leading abbreviation.
	const offsetFmt = format.formatToParts(new Date(time));
	const tzParts = offsetFmt.find((p) => p.type === 'timeZoneName');
	const offsetString = tzParts ? tzParts.value.slice(3) : '';

	// UTC and its equivalents must be handled directly, because Intl will return 'GMT'.
	if (offsetString === '') {
		return { offsetString: '+00:00', offsetMinutes: 0 };
	}

	// Parse the hours and minutes from the result.
	const hours: number = parseInt(offsetString.slice(0, 3));
	const minutes: number = parseInt(offsetString.slice(4));
	const offsetMinutes = -hours * 60 + (hours < 0 ? 1 : -1) * minutes;

	// Return the ISO 8601 formatted offset string, as well as the total minutes offset.
	// Note, this returns minutes inverted, to match the behavior of the Date.getTimezoneOffset function.
	return { offsetString, offsetMinutes };
};

export const formatTime = (time: string, timezone: string) => {
	const iso = new RegExp(
		//eslint-disable-next-line no-useless-escape
		/[0-9]{4}\-[0-9]{2}\-[0-9]{2}T[0-9]{2}\:[0-9]{2}\:[0-9]{2}\.[0-9]{3}Z/,
	);
	const offset = new RegExp(
		//eslint-disable-next-line no-useless-escape
		/[0-9]{4}\-[0-9]{2}\-[0-9]{2}T[0-9]{2}\:[0-9]{2}\:[0-9]{2}[+-][0-9]{2}\:[0-9]{2}/,
	);
	const noTz = new RegExp(
		//eslint-disable-next-line no-useless-escape
		/[0-9]{4}\-[0-9]{2}\-[0-9]{2}[T ][0-9]{2}\:[0-9]{2}\:[0-9]{2}/,
	);

	// which format are we coming in as
	if (time.match(iso)) {
		return time;
	} // send it right back
	if (time.match(offset)) {
		return new Date(time).toISOString();
	} // convert to UTC

	if (time.match(noTz)) {
		let newTime = time.trim().replace(' ', 'T');
		const { offsetString } = getCurrentOffset(time, timezone);

		newTime += offsetString;
		return new Date(newTime).toISOString();
	}

	return null;
};
