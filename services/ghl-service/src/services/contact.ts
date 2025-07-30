import { GHL_API_VERSION, GHL_API_URL } from 'constants/constants';
import { GHLAppointmentData, GHLContactData, TLPPatientData } from 'types/common';
import { safeJsonParse } from 'utils/common';

const createContactService = () => {
	const getContact = async (id: string, token: string) => {
		const opts = {
			method: 'GET',
			headers: {
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
		};
		console.log(`${GHL_API_URL}/contacts/${id}`);
		const resp = await fetch(`${GHL_API_URL}/contacts/${id}`, opts);

		const dataStr = await resp.text();

		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	const findContact = async (location: string, token: string, query: string) => {
		const opts = {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
		};

		const resp = await fetch(
			`${GHL_API_URL}/contacts/?locationId=${location}&query=${query}`,
			opts,
		);
		const dataStr = await resp.text();

		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	const updateContact = async (contact: GHLContactData, token: string) => {
		if (!contact.id) {
			return { status: 400, data: 'missing contact id' };
		}

		const sendData = { ...contact } as any;

		// strip location id
		if (sendData.locationId) {
			delete sendData.locationId;
			delete sendData.id;
		}

		const opts = {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
			body: JSON.stringify(sendData),
		};

		const resp = await fetch(`${GHL_API_URL}/contacts/${contact.id}`, opts);

		const dataStr = await resp.text();
		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	const createContact = async (contact: GHLContactData, token: string) => {
		const opts = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
			body: JSON.stringify(contact),
		};

		const resp = await fetch(`${GHL_API_URL}/contacts/`, opts);

		const dataStr = await resp.text();

		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	const upsertContact = async (contact: GHLContactData, token: string) => {
		console.log(contact);
		const opts = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
			body: JSON.stringify(contact),
		};

		const resp = await fetch(`${GHL_API_URL}/contacts/upsert`, opts);

		const dataStr = await resp.text();

		if (resp.status >= 200 && resp.status < 300) {
			const json = safeJsonParse(dataStr);
			return { status: resp.status, data: json };
		}

		return { status: resp.status, data: dataStr };
	};

	return {
		getContact,
		findContact,
		updateContact,
		createContact,
		upsertContact,
	};
};

export const contactService = createContactService();
