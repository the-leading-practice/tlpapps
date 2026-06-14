/**
 * Combined patient + appointment + status-mapping utilities.
 * Ported from patient-service utils/.
 */
import { IncomingHttpHeaders } from 'http';
import type { TLPPatientData, TLPAppointmentData, ApptData, LocationSetting } from './types.js';
import { patientDataService } from './services.js';
import { logger } from './loggerAdapter.js';
import { integrationService } from '../integration/services.js';

// ── String helpers ──────────────────────────────────────────────────────────

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

// ── Location helpers ────────────────────────────────────────────────────────

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

	// GHL auth token: the authToken middleware overwrites x-tlp-app-jwt with the signed
	// TLP JWT (not a GHL token). The real GHL access_token rides in x-tlp-app-location
	// as "<location> <ghlAccessToken>". Prefer that; fall back to the header for any
	// non-middleware caller that still passes the GHL token directly.
	const jwt = getLocation(locHeader).token || (headers['x-tlp-app-jwt'] as string) || '';
	const pushGHL = headers['x-tlp-app-pushghl'] !== undefined;
	const pushAppt = headers['x-tlp-app-pushappt'] !== undefined;
	const pushPat = headers['x-tlp-app-pushPat'] !== undefined;

	return {
		locHeader,
		calendarId,
		timezone,
		jwt,
		pushGHL,
		pushAppt,
		pushPat,
		software,
	};
};

// ── Time helpers ────────────────────────────────────────────────────────────

export const getCurrentOffset = (time: string, timeZone: string) => {
	const format = new Intl.DateTimeFormat('en', {
		timeZone,
		timeZoneName: 'longOffset',
	});

	const offsetFmt = format.formatToParts(new Date(time));
	const tzParts = offsetFmt.find((p) => p.type === 'timeZoneName');
	const offsetString = tzParts ? tzParts.value.slice(3) : '';

	if (offsetString === '') {
		return { offsetString: '+00:00', offsetMinutes: 0 };
	}

	const hours: number = parseInt(offsetString.slice(0, 3));
	const minutes: number = parseInt(offsetString.slice(4));
	const offsetMinutes = -hours * 60 + (hours < 0 ? 1 : -1) * minutes;

	return { offsetString, offsetMinutes };
};

export const formatTime = (time: string, timezone: string) => {
	if (!time) return null;

	// eslint-disable-next-line no-useless-escape
	const iso = new RegExp(/[0-9]{4}\-[0-9]{2}\-[0-9]{2}T[0-9]{2}\:[0-9]{2}\:[0-9]{2}\.[0-9]{3}Z/);
	const offset = new RegExp(
		// eslint-disable-next-line no-useless-escape
		/[0-9]{4}\-[0-9]{2}\-[0-9]{2}T[0-9]{2}\:[0-9]{2}\:[0-9]{2}[+-][0-9]{2}\:[0-9]{2}/,
	);
	// eslint-disable-next-line no-useless-escape
	const noTz = new RegExp(/[0-9]{4}\-[0-9]{2}\-[0-9]{2}[T ][0-9]{2}\:[0-9]{2}\:[0-9]{2}/);

	if (time.match(iso)) {
		return time;
	}
	if (time.match(offset)) {
		return new Date(time).toISOString();
	}

	if (time.match(noTz)) {
		let newTime = time.trim().replace(' ', 'T');
		const { offsetString } = getCurrentOffset(time, timezone);

		newTime += offsetString;
		return new Date(newTime).toISOString();
	}

	return null;
};

// ── Deep comparison ─────────────────────────────────────────────────────────

export const isObject = (object: any) => {
	return object !== null && typeof object === 'object';
};

export const deepEqual = (object1: any, object2: any, ignore: string[] = []): boolean => {
	const objKeys1 = Object.keys(object1);

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

// ── Patient verification ────────────────────────────────────────────────────

export const verifyPatient = (patient: TLPPatientData, contact: TLPPatientData) => {
	if (
		safeStringCompare(contact.email, patient.email) &&
		safeStringCompare(contact.firstName, patient.firstName) &&
		safeStringCompare(contact.lastName, patient.lastName) &&
		safeStringCompare(contact.phone, patient.mobile)
	) {
		if (contact.businessId) {
			return safeStringCompare(contact.businessId, patient.patientId.toString());
		}

		return true;
	}

	return false;
};

// ── Status mapping ──────────────────────────────────────────────────────────

export type AppointmentStatus = 'new' | 'confirmed' | 'cancelled' | 'showed' | 'noshow' | 'invalid';

export interface MappingEntry {
	status: string;
	ghlValue: AppointmentStatus;
}

export interface StatusMapping {
	default: MappingEntry;
	entries: MappingEntry[];
}

export const DrChronoMapping: StatusMapping = {
	default: {
		status: '',
		ghlValue: 'new',
	},
	entries: [
		{ status: 'Confirmed', ghlValue: 'confirmed' },
		{ status: 'Not Confirmed', ghlValue: 'confirmed' },
		{ status: 'Arrived', ghlValue: 'confirmed' },
		{ status: 'In Session', ghlValue: 'showed' },
		{ status: 'Complete', ghlValue: 'showed' },
		{ status: 'No Show', ghlValue: 'noshow' },
		{ status: 'Cancelled', ghlValue: 'cancelled' },
		{ status: 'Rescheduled', ghlValue: 'cancelled' },
	],
};

export const ChrioTouchMapping: StatusMapping = {
	default: {
		status: '',
		ghlValue: 'new',
	},
	entries: [
		{ status: '1004', ghlValue: 'confirmed' },
		{ status: '1001', ghlValue: 'cancelled' },
		{ status: '1006', ghlValue: 'cancelled' },
		{ status: '1002', ghlValue: 'showed' },
		{ status: '1003', ghlValue: 'showed' },
		{ status: '1007', ghlValue: 'noshow' },
		{ status: '1008', ghlValue: 'invalid' },
	],
};

export const getAppointmentStatus = (name: string, status: string) => {
	let mapping: MappingEntry | undefined;
	switch (name) {
		case 'ChiroTouch':
			mapping = ChrioTouchMapping.entries.find((e: MappingEntry) => e.status === status);
			break;
		case 'DrChrono':
			mapping = DrChronoMapping.entries.find((e: MappingEntry) => e.status === status);
			break;
	}

	if (mapping !== undefined) {
		return mapping.ghlValue;
	}

	return 'new';
};

// ── Appointment generation ──────────────────────────────────────────────────

export const generateAppointment = async (
	tlpAppt: ApptData,
	settings: LocationSetting,
	softwareName: string,
): Promise<TLPAppointmentData> => {
	const location = getLocation(settings.locHeader).location;
	const formattedTime = formatTime(tlpAppt.apptTime, settings.timezone);

	const newAppt: TLPAppointmentData = {
		patientId: tlpAppt.patientId,
		apptId: tlpAppt.apptId,
		startTime: formattedTime || tlpAppt.apptTime,
		status: getAppointmentStatus(softwareName, `${tlpAppt.apptStatus}`),
		address: `${tlpAppt.patientId}`,
		locationId: location,
		calendarId: settings.calendarId,
	};

	// find patient
	const patient = await patientDataService.getPatient(location, tlpAppt.patientId);
	if (!patient) return newAppt;

	newAppt.contactId = patient.contactId;

	if (newAppt.contactId && newAppt.contactId.length <= 0) {
		logger.writeLog('warn', `missing contactId for appointment ${tlpAppt.apptId}`);
		logger.writeLog('warn', JSON.stringify(tlpAppt));
	}

	// find mapping entry
	const mapping = await appointmentDataService.getAppointment(location, tlpAppt.apptId);
	if (mapping) {
		logger.writeLog(
			'debug',
			`appointment ${tlpAppt.apptId} exists in mapping db with ghlApptId ${mapping.ghlApptId}`,
		);
		newAppt.ghlApptId = mapping.ghlApptId;
	} else {
		logger.writeLog('debug', `no mapping found for appointment ${tlpAppt.apptId}`);
	}

	// see if this appointment exists at GHL
	let ghlAppt: TLPAppointmentData | null = null;
	if (!mapping || !mapping.ghlApptId) {
		const resp = await integrationService.getAppointmentsForContact(
			patient.contactId,
			settings.jwt,
		);
		if (resp.status >= 200 && resp.status < 300) {
			ghlAppt = resp.data.find((a: TLPAppointmentData) => {
				return new Date(a.startTime).getTime() === new Date(newAppt.startTime).getTime();
			});
			if (ghlAppt) {
				logger.writeLog('debug', `found ${ghlAppt?.ghlApptId} merging with ${tlpAppt.apptId}`);
			}
		}
	}

	// this appointment doesn't exist in the mapping db but does at GHL
	if (ghlAppt) {
		newAppt.ghlApptId = ghlAppt.ghlApptId;
	}

	return newAppt;
};

// Import the appointment data service for generateAppointment
import { appointmentDataService } from './services.js';
