import { CLIENT_ID, CLIENT_SECRET, GHL_API_URL, GHL_API_VERSION } from '../constants.js';
import { fetchJson } from 'utils/json.js';

const createGHLTokenService = () => {
	const renewAuthToken = async (code: string) => {
		const accessData = {
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			grant_type: 'refresh_token',
			refresh_token: code,
			user_type: 'Location',
		};

		const formBody: string[] = [];
		const keys = Object.keys(accessData);
		type ObjectKey = keyof typeof accessData;

		keys.forEach((key) => {
			const encodedKey = encodeURIComponent(key);
			const encodedVal = encodeURIComponent(accessData[key as ObjectKey]);

			formBody.push(`${encodedKey}=${encodedVal}`);
		});

		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: formBody.join('&'),
		};

		const resp = await fetchJson(`${GHL_API_URL}/oauth/token`, options);
		return resp;
	};

	const getLocationData = async (locationId: string, token: string) => {
		const options = {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				version: GHL_API_VERSION,
			},
		};

		console.log(`GET: ${GHL_API_URL}/locations/${locationId}`);

		const resp = await fetchJson(`${GHL_API_URL}/locations/${locationId}`, options);
		return resp;
	};

	return {
		renewAuthToken,
		getLocationData,
	};
};

export const ghlTokenService = createGHLTokenService();
