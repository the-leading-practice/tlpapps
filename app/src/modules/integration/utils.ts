/**
 * Combined GHL patient + appointment translation utilities.
 * Ported from ghl-service/src/utils/patientUtils.ts and apptUtils.ts.
 */
import type {
	GHLContactData,
	GHLAppointmentData,
	TLPPatientData,
	TLPAppointmentData,
} from './types.js';
import { config } from '../../config.js';
import { suppressAutomation } from '../sync/suppression.js';

// GHL custom field for patient ID mapping
const GHL_CUSTOM_FIELD_ID = 'SEyhHXZR8hzYYpy7qByu';

// ── String helpers (local to integration) ───────────────────────────────────

export const safeStringCompare = (left: string, right: string): boolean => {
	if (left.toLowerCase().trim() === right.toLowerCase().trim()) {
		return true;
	}

	return false;
};

// ── Time helpers ────────────────────────────────────────────────────────────

export const getCurrentOffset = (timeZone: string) => {
	const format = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' });

	const offsetFmt = format.formatToParts();
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
		const { offsetString } = getCurrentOffset(timezone);

		newTime += offsetString;
		return new Date(newTime).toISOString();
	}

	return null;
};

// ── Location helper ─────────────────────────────────────────────────────────

export const getLocation = (header: string) => {
	if (header.length === 0) return { location: '', token: '' };

	const [location, token] = header.split(' ');
	return { location: location, token: token };
};

// ── Patient verification ────────────────────────────────────────────────────

export const verifyPatient = (patient: TLPPatientData, contact: GHLContactData) => {
	if (
		safeStringCompare(contact.email as string, patient.email || '') &&
		safeStringCompare(contact.firstName, patient.firstName) &&
		safeStringCompare(contact.lastName, patient.lastName) &&
		safeStringCompare(contact.phone as string, patient.mobile || '')
	) {
		return true;
	}

	return false;
};

// ── Patient phone helper ────────────────────────────────────────────────────

export const getPatientPhone = (patient: TLPPatientData): string => {
	const props = ['mobile', 'phone', 'home', 'work'];

	let phone = '';
	for (const p of props) {
		const key = p;
		console.log(`checking ${key} ${(patient as any)[key]}`);
		if ((patient as any)[key] && (patient as any)[key].length > 0) {
			phone = (patient as any)[key];
			console.log(`found value in ${key}`);

			break;
		}
	}

	return phone;
};

// ── TLP <-> GHL patient translation ─────────────────────────────────────────

export const translateTLPtoGHL = (patient: TLPPatientData, location: string): GHLContactData => {
	console.log(patient);

	const contact: GHLContactData = {
		locationId: location,
		firstName: patient.firstName,
		lastName: patient.lastName,
		name: `${patient.firstName} ${patient.lastName}`,
		address1: patient.address,
		city: patient.city,
		state: patient.state,
		postalCode: patient.postalCode,
		timezone: patient.timezone,
		companyName: `${patient.patientId}`,
		// SAFETY: every synced contact MUST carry the suppression tag so the owner's
		// GHL workflows (filtered to exclude it) never fire for migrated patients.
		// Sourced from config.ghl.suppressTag (GHL_SUPPRESS_TAG, default "Existing
		// Patient") — single source of truth, not a hardcoded literal.
		tags: ['API', config.ghl.suppressTag],
		// SAFETY: DND backstop. dnd:false preserved unless GHL_SUPPRESS_AUTOMATION is on,
		// then force dnd:true so synced patients never trigger GHL automation workflows.
		dnd: suppressAutomation() ? true : false,
		customFields: [
			{
				id: GHL_CUSTOM_FIELD_ID,
				field_value: `${patient.patientId}`,
			},
		],
	};

	if (patient.contactId) {
		contact.id = patient.contactId;
	}

	if (patient.email && patient.email.trim().length > 0) {
		contact.email = patient.email;
	}

	if (patient.phone && patient.phone.length > 0) {
		contact.phone = patient.phone;
	}

	return contact;
};

export const translateGHLtoTLP = (contact: GHLContactData): TLPPatientData => {
	const tlpPatient: TLPPatientData = {
		contactId: contact.id,
		patientId: -1,
		firstName: contact.firstName,
		lastName: contact.lastName,
		address: contact.address1,
		city: contact.city,
		state: contact.state,
		postalCode: contact.postalCode,
		country: contact.country,
		timezone: contact.timezone,
		phone: contact.phone || '',
		mobile: null,
		home: null,
		work: null,
		email: contact.email || '',
		dob: contact.dateOfBirth,
		tags: contact.tags,
	};

	if (contact.customFields) {
		tlpPatient.customFields = contact.customFields;
	}

	return tlpPatient;
};

// ── TLP <-> GHL appointment translation ─────────────────────────────────────

export const translateApptGHLtoTLP = (appt: GHLAppointmentData): TLPAppointmentData => {
	console.log(`appointment`);
	console.log(appt);
	const appointment: TLPAppointmentData = {
		patientId: -1,
		contactId: appt.contactId,
		apptId: -1,
		ghlApptId: appt.id || '',
		startTime: appt.startTime,
		status: appt.appoinmentStatus || '',
		calendarId: appt.calendarId,
		locationId: appt.locationId,
	};

	console.log('translateApptGHLtoTLP');
	console.log(appointment);

	return appointment;
};

export const translateApptTLPtoGHL = (
	appt: TLPAppointmentData,
	location: string | undefined,
	calendar: string,
): GHLAppointmentData => {
	const appointment: GHLAppointmentData = {
		calendarId: calendar,
		locationId: location || '',
		contactId: appt.contactId || '',
		id: appt.ghlApptId,
		startTime: appt.startTime,
		appointmentStatus: appt.status,
		toNotify: false,
		address: `${appt.apptId}`,
		// Carry the loop-prevention origin tag into GHL's `notes` field so that the
		// resulting webhook echo is recognized as self-authored and skipped.
		...(appt.syncOriginTag ? { notes: appt.syncOriginTag } : {}),
	};

	console.log('translateApptTLPtoGHL');
	console.log(appointment);

	return appointment;
};
