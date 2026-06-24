/**
 * Combined GHL API services for contacts and appointments.
 * Ported from ghl-service/src/services/contact.ts and appointment.ts.
 *
 * NOTE: The patient-service had its own "integrationService" that called the
 * ghl-service via HTTP. Now that both live in the same process, the patient
 * module's integrationService calls are replaced with direct calls here.
 * This file talks directly to the GHL API.
 */
import { config } from '../../config.js';
import { safeJsonParse } from '../../utils/fetch.js';
import type { GHLContactData, GHLAppointmentData, GHLCalendarBlock, TLPAppointmentData } from './types.js';

const GHL_API_URL = config.ghl.apiUrl;
const GHL_API_VERSION = config.ghl.apiVersion;

// ── Shared fetch helper ─────────────────────────────────────────────────────

const ghlFetch = async (url: string, opts: RequestInit) => {
	const resp = await fetch(url, opts);
	const dataStr = await resp.text();

	if (resp.status >= 200 && resp.status < 300) {
		const json = safeJsonParse(dataStr);
		return { status: resp.status, data: json };
	}

	return { status: resp.status, data: dataStr };
};

const ghlHeaders = (token: string, includeContentType = true) => {
	const headers: Record<string, string> = {
		authorization: `Bearer ${token}`,
		version: GHL_API_VERSION,
	};
	if (includeContentType) {
		headers['Content-Type'] = 'application/json';
	}
	return headers;
};

// ── Contact service ─────────────────────────────────────────────────────────

const createContactService = () => {
	const getContact = async (id: string, token: string) => {
		console.log(`${GHL_API_URL}/contacts/${id}`);
		return ghlFetch(`${GHL_API_URL}/contacts/${id}`, {
			method: 'GET',
			headers: ghlHeaders(token, false),
		});
	};

	const findContact = async (location: string, token: string, query: string) => {
		return ghlFetch(`${GHL_API_URL}/contacts/?locationId=${location}&query=${query}`, {
			method: 'GET',
			headers: ghlHeaders(token),
		});
	};

	const updateContact = async (contact: GHLContactData, token: string) => {
		if (!contact.id) {
			return { status: 400, data: 'missing contact id' };
		}

		const sendData = { ...contact } as any;

		if (sendData.locationId) {
			delete sendData.locationId;
			delete sendData.id;
		}

		return ghlFetch(`${GHL_API_URL}/contacts/${contact.id}`, {
			method: 'PUT',
			headers: ghlHeaders(token),
			body: JSON.stringify(sendData),
		});
	};

	const createContact = async (contact: GHLContactData, token: string) => {
		return ghlFetch(`${GHL_API_URL}/contacts/`, {
			method: 'POST',
			headers: ghlHeaders(token),
			body: JSON.stringify(contact),
		});
	};

	const upsertContact = async (contact: GHLContactData, token: string) => {
		console.log(contact);
		return ghlFetch(`${GHL_API_URL}/contacts/upsert`, {
			method: 'POST',
			headers: ghlHeaders(token),
			body: JSON.stringify(contact),
		});
	};

	return {
		getContact,
		findContact,
		updateContact,
		createContact,
		upsertContact,
	};
};

// ── Appointment service ─────────────────────────────────────────────────────

const createAppointmentService = () => {
	const getAppointment = async (eventId: string, token: string) => {
		return ghlFetch(`${GHL_API_URL}/calendars/events/appointments/${eventId}`, {
			method: 'GET',
			headers: ghlHeaders(token),
		});
	};

	const getAppointmentsForContact = async (contactId: string, token: string) => {
		return ghlFetch(`${GHL_API_URL}/contacts/${contactId}/appointments`, {
			method: 'GET',
			headers: ghlHeaders(token),
		});
	};

	const createAppointment = async (appt: GHLAppointmentData, token: string) => {
		return ghlFetch(`${GHL_API_URL}/calendars/events/appointments/`, {
			method: 'POST',
			headers: ghlHeaders(token),
			body: JSON.stringify(appt),
		});
	};

	const updateAppointment = async (appt: GHLAppointmentData, token: string) => {
		return ghlFetch(`${GHL_API_URL}/calendars/events/appointments/${appt.id}`, {
			method: 'PUT',
			headers: ghlHeaders(token),
			body: JSON.stringify(appt),
		});
	};

	const deleteAppointment = async () => {};

	const createCalendarBlock = async (block: GHLCalendarBlock, token: string) => {
		return ghlFetch(`${GHL_API_URL}/calendars/events/block-slots`, {
			method: 'POST',
			headers: ghlHeaders(token),
			body: JSON.stringify(block),
		});
	};

	const getCalendarBlocks = async (
		startTime: string,
		endTime: string,
		locationId: string,
		calendarId: string,
		token: string,
	) => {
		const query = `?locationId=${locationId}&calendarId=${calendarId}&startTime=${startTime}&endTime=${endTime}`;

		return ghlFetch(`${GHL_API_URL}/calendars/blocked-slots/${query}`, {
			method: 'GET',
			headers: ghlHeaders(token),
		});
	};

	const deleteCalendarBlock = async (eventId: string, token: string) => {
		return ghlFetch(`${GHL_API_URL}/calendars/events/${eventId}`, {
			method: 'DELETE',
			headers: ghlHeaders(token),
		});
	};

	return {
		getAppointment,
		getAppointmentsForContact,
		createAppointment,
		updateAppointment,
		deleteAppointment,
		createCalendarBlock,
		getCalendarBlocks,
		deleteCalendarBlock,
	};
};

// ── Calendar service (BIDI-03 onboarding) ───────────────────────────────────
// Provisions/maps GHL service calendars from DrChrono appointment profiles.

export type GHLCalendarCreate = {
	locationId: string;
	name: string;
	/** GHL calendar type — 'event' for a generic service/event calendar. */
	calendarType?: string;
	/** URL slug; GHL requires a unique slug per location. */
	slug?: string;
	/** Default slot duration in minutes. */
	slotDuration?: number;
	/** Hex color shown in the GHL UI. */
	eventColor?: string;
	/** GHL user ids assigned as team members (required by some GHL accounts). */
	teamMembers?: { userId: string }[];
};

const createCalendarService = () => {
	const listCalendars = async (locationId: string, token: string) => {
		return ghlFetch(`${GHL_API_URL}/calendars/?locationId=${locationId}`, {
			method: 'GET',
			headers: ghlHeaders(token),
		});
	};

	const createCalendar = async (payload: GHLCalendarCreate, token: string) => {
		return ghlFetch(`${GHL_API_URL}/calendars/`, {
			method: 'POST',
			headers: ghlHeaders(token),
			body: JSON.stringify(payload),
		});
	};

	const listUsers = async (locationId: string, token: string) => {
		return ghlFetch(`${GHL_API_URL}/users/?locationId=${locationId}`, {
			method: 'GET',
			headers: ghlHeaders(token),
		});
	};

	const getCalendar = async (calendarId: string, token: string) => {
		return ghlFetch(`${GHL_API_URL}/calendars/${calendarId}`, {
			method: 'GET',
			headers: ghlHeaders(token),
		});
	};

	return { listCalendars, createCalendar, listUsers, getCalendar };
};

// ── Combined integration service (used by patient module) ───────────────────
// This replaces the old patient-service integrationService that made HTTP calls
// to the ghl-service. Now everything is in-process.

const contact = createContactService();
const appointment = createAppointmentService();
const calendar = createCalendarService();

const createIntegrationService = () => {
	// These mirror the old patient-service integrationService API
	// but now call GHL directly instead of going through HTTP to ghl-service.

	const getContact = async (contactId: string, jwt: string) => {
		const resp = await contact.getContact(contactId, jwt) as any;

		if (resp.status >= 200 && resp.status < 300 && resp.data?.contact) {
			// The old integration service extracted the contact from the wrapper
			const { translateGHLtoTLP } = await import('./utils.js');
			const tlpPatient = translateGHLtoTLP(resp.data.contact);
			return { status: resp.status, data: tlpPatient };
		}

		return resp;
	};

	const findContact = async (patient: any, jwt: string) => {
		// Build query same way the old integration service did
		let query = '';
		if (patient.email) query = patient.email;
		else if (patient.firstName && patient.lastName)
			query = `${patient.firstName} ${patient.lastName}`;
		else if (patient.phone) query = patient.mobile;

		// Need a location - get from the patient-service's getLocation
		// The old code used x-tlp-app-location header which contains "locationId token"
		// Here we need just the token portion for GHL auth
		const resp = await contact.findContact('', jwt, query) as any;

		if (resp.status >= 200 && resp.status < 300 && resp.data?.contacts) {
			const { translateGHLtoTLP } = await import('./utils.js');
			const tlpPatients = resp.data.contacts.map((c: any) => translateGHLtoTLP(c));
			return { status: resp.status, data: tlpPatients };
		}

		return resp;
	};

	const createContact = async (patient: any, jwt: string) => {
		const { translateTLPtoGHL } = await import('./utils.js');
		// We need a locationId - but in the old flow this came from the x-tlp-app-location header
		// which was passed through to the ghl-service. In the new monolith, the patient controller
		// passes the raw patient data. The ghl contact controller extracts location from headers.
		// For now we pass locationId if available on the patient object.
		const ghlContact = translateTLPtoGHL(patient, patient.locationId || '');
		return contact.upsertContact(ghlContact, jwt);
	};

	const upsertContact = async (patient: any, jwt: string) => {
		const { translateTLPtoGHL } = await import('./utils.js');
		const ghlContact = translateTLPtoGHL(patient, patient.locationId || '');
		// GHL /contacts/upsert rejects a body with `id` ("property id should not exist").
		// It dedupes by email/phone within the location, so id is unnecessary here.
		delete (ghlContact as any).id;
		return contact.upsertContact(ghlContact, jwt);
	};

	const updateContact = async (patient: any, contactId: string, jwt: string) => {
		const modPatient = patient;
		modPatient.name = modPatient.contactName;
		delete modPatient.contactName;

		const { translateTLPtoGHL } = await import('./utils.js');
		const ghlContact = translateTLPtoGHL(modPatient, modPatient.locationId || '');
		ghlContact.id = contactId;
		return contact.updateContact(ghlContact, jwt);
	};

	const getAppointmentsForContact = async (contactId: string, jwt: string) => {
		return appointment.getAppointmentsForContact(contactId, jwt);
	};

	// Create a GHL blocked-time slot (for DrChrono breaks — no contact/patient).
	// NOTE: block-slots must NOT include calendarId for service_booking calendars
	// (GHL: "The calendar is not an event calendar"); assignedUserId is required.
	const createBlock = async (
		block: { locationId: string; startTime: string; endTime: string; assignedUserId: string; title?: string },
		jwt: string,
	) => {
		return appointment.createCalendarBlock(
			{
				locationId: block.locationId,
				startTime: block.startTime,
				endTime: block.endTime,
				assignedUserId: block.assignedUserId,
				title: block.title || 'Blocked',
			},
			jwt,
		);
	};

	// Fetch a GHL calendar; used to resolve teamMembers[0].userId for block-slots.
	const getCalendar = async (calendarId: string, jwt: string) => {
		return calendar.getCalendar(calendarId, jwt);
	};

	const createAppointment = async (appt: any, jwt: string) => {
		const { translateApptTLPtoGHL } = await import('./utils.js');
		const ghlAppt = translateApptTLPtoGHL(appt, appt.locationId || '', appt.calendarId || '');
		const resp = await appointment.createAppointment(ghlAppt, jwt);

		if (resp.status >= 200 && resp.status < 300) {
			return { status: resp.status, data: { ...resp.data, ghlApptId: resp.data?.id } };
		}

		return resp;
	};

	const updateAppointment = async (appt: any, jwt: string) => {
		const { translateApptTLPtoGHL } = await import('./utils.js');
		const ghlAppt = translateApptTLPtoGHL(appt, appt.locationId || '', appt.calendarId || '');
		const resp = await appointment.updateAppointment(ghlAppt, jwt);

		if (resp.status >= 200 && resp.status < 300) {
			const { translateApptGHLtoTLP } = await import('./utils.js');
			const tlpAppt = translateApptGHLtoTLP(resp.data);
			return { status: resp.status, data: tlpAppt };
		}

		return resp;
	};

	return {
		getContact,
		findContact,
		createContact,
		upsertContact,
		updateContact,
		getAppointmentsForContact,
		createAppointment,
		updateAppointment,
		createBlock,
		getCalendar,
	};
};

export const integrationService = createIntegrationService();

// Also export the raw GHL services for the integration controllers
export const contactService = contact;
export const appointmentGHLService = appointment;
export const calendarService = calendar;
