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
			start: start.toISOString().replace('Z', ''),
			end: end.toISOString().replace('Z', ''),
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

		return { status: resp.status, data: json };
	};

	const getBlock = async (start: Date, end: Date, location: LocationSetting) => {
		const query = `?startTime=${start.getTime()}&endTime=${end.getTime()}`;

		const options = {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${location.token}`,
			},
		};

		const resp = await fetch(`${TLP_API_URL}/ghl/calendar/block${query}`, options);
		const text = await resp.text();
		let json: any;

		if (resp.status === 200) {
			json = await resp.json();
		}

		return { status: resp.status, data: resp.status === 200 ? json : text };
	};

	return {
		login,
		addBlock,
		getBlock,
	};
};

export const tlpService = createTLPService();
