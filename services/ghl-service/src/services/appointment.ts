import { GHL_API_VERSION, GHL_API_URL } from 'constants/constants';
import { GHLAppointmentData } from 'types/common';
import { safeJsonParse } from 'utils/common';

const createAppointmentService = () => {
	const getAppointment = async (eventId: string, token: string) => {
		const opts = {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
		};

		const resp = await fetch(`${GHL_API_URL}/calendars/events/appointments/${eventId}`, opts);

		const dataStr = await resp.text();

		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	const getAppointmentsForContact = async (contactId: string, token: string) => {
		const opts = {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
		};

		const resp = await fetch(`${GHL_API_URL}/contacts/${contactId}/appointments`, opts);

		const dataStr = await resp.text();

		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	const createAppointment = async (appt: GHLAppointmentData, token: string) => {
		const opts = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
			body: JSON.stringify(appt),
		};

		const resp = await fetch(`${GHL_API_URL}/calendars/events/appointments/`, opts);

		const dataStr = await resp.text();

		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	const updateAppointment = async (appt: GHLAppointmentData, token: string) => {
		const opts = {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
			body: JSON.stringify(appt),
		};

		const resp = await fetch(`${GHL_API_URL}/calendars/events/appointments/${appt.id}`, opts);

		const dataStr = await resp.text();

		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	const deleteAppointment = async () => {};

	return {
		getAppointment,
		getAppointmentsForContact,
		createAppointment,
		updateAppointment,
		deleteAppointment,
	};
};

export const appointmentService = createAppointmentService();
