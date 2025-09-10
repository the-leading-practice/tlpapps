import { IncomingHttpHeaders } from 'http';
import { LocationSetting } from '../types/common.js';

export const safeStringCompare = (left: string, right: string): boolean => {
	if (typeof left === 'undefined' || typeof right === 'undefined') return false;

	if (left === right) return true;

	if (left === null) return false;
	if (right === null) return false;

	if (left.toLowerCase().trim() === right.toLowerCase().trim()) {
		return true;
	}

	return false;
};

export const safeJsonParse = (data: string) => {
	let parsed;

	try {
		parsed = JSON.parse(data);
	} catch (e) {
		console.log((e as Error).message);
	}

	return parsed;
};

export const getLocation = (header: string) => {
	if (header.length === 0) return { location: '', token: '' };

	const [location, token] = header.split(' ');

	return { location: location, token: token };
};

export const getLocationSettings = (headers: IncomingHttpHeaders): LocationSetting => {
	const locHeader = (headers['x-tlp-app-location'] as string) || '';
	const calendarId = (headers['x-tlp-app-calendar'] as string) || '';
	const timezone = (headers['x-tlp-app-timezone'] as string) || '';
	const software = (headers['x-tlp-app-software'] as string) || '';

	const jwt = (headers['x-tlp-app-jwt'] as string) || '';
	const pushGHL = headers['x-tlp-app-pushghl'] !== undefined;
	const pushAppt = headers['x-tlp-app-pushappt'] !== undefined;
	const pushPat = headers['x-tlp-app-pushPat'] !== undefined;

	return {
		locHeader: locHeader,
		calendarId: calendarId,
		timezone: timezone,
		jwt: jwt,
		pushGHL: pushGHL,
		pushAppt: pushAppt,
		pushPat: pushPat,
		software: software,
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
	// eslint-disable-next-line no-useless-escape
	const iso = new RegExp(/[0-9]{4}\-[0-9]{2}\-[0-9]{2}T[0-9]{2}\:[0-9]{2}\:[0-9]{2}\.[0-9]{3}Z/);
	const offset = new RegExp(
		// eslint-disable-next-line no-useless-escape
		/[0-9]{4}\-[0-9]{2}\-[0-9]{2}T[0-9]{2}\:[0-9]{2}\:[0-9]{2}[+-][0-9]{2}\:[0-9]{2}/,
	);
	// eslint-disable-next-line no-useless-escape
	const noTz = new RegExp(/[0-9]{4}\-[0-9]{2}\-[0-9]{2}[T ][0-9]{2}\:[0-9]{2}\:[0-9]{2}/);

	// which format are we coming in as
	if (time.match(iso)) {
		return time;
	} // send it right back
	if (time.match(offset)) {
		return new Date(time).toISOString();
	} // convert to UTC

	if (time.match(noTz)) {
		let newTime = time.trim().replace(' ', 'T');
		const { offsetString, offsetMinutes } = getCurrentOffset(time, timezone);

		newTime += offsetString;
		return new Date(newTime).toISOString();
	}

	return null;
};

export const deepEqual = (object1: any, object2: any, ignore: string[] = []): boolean => {
	const objKeys1 = Object.keys(object1);
	const objKeys2 = Object.keys(object2);

	// if( objKeys1.length !== objKeys2.length ) {
	//   console.log( `${objKeys1.length} does not equal ${objKeys2.length}` );
	//   return false;
	// }

	for (const key of objKeys1) {
		if (ignore.length > 0 && ignore.indexOf(key) > -1) {
			continue;
		}

		const value1 = object1[key];
		const value2 = object2[key];

		if (value1 === null || value1.length === 0 || typeof value1 === 'undefined') {
			continue;
		}

		const isObjects = isObject(value1) && isObject(value2);

		if ((isObjects && !deepEqual(value1, value2)) || (!isObjects && value1 !== value2)) {
			return false;
		}
	}

	return true;
};

export const isObject = (object: any) => {
	return object !== null && typeof object === 'object';
};
