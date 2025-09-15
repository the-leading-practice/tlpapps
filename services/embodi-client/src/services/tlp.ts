import logger from '../logger.js';
import { LocationSetting } from '../types/types.js';

const TLP_API_URL = 'https://tlpapps.theleadingpractice.com/api/';

const createTLPService = () => {
	const login = async (location: string, secret: string) => {
		const auth = {
			location,
			secret,
		};

		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(auth),
		};

		const resp = await fetch(`${TLP_API_URL}auth`, options);

		if (resp.ok) {
			const json = await resp.json();
			return json;
		}

		return undefined;
	};

	const addBlock = async (start: Date, end: Date, location: LocationSetting) => {
		const blockData = {
			start: start.toISOString(),
			end: end.toISOString(),
		};

		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${location.token}`,
			},
			body: JSON.stringify(blockData),
		};

		// send to ghl
		const resp = await fetch(`${TLP_API_URL}ghl/calendar/block`, options);
		const json = await resp.json();

		return { status: resp.status, data: json.data };
	};

	return {
		login,
		addBlock,
	};
};

export const tlpService = createTLPService();
