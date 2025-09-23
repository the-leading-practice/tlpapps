import registry from '../registry.js';
import { EMBODI_AUTH_URL, EMBODI_API_URL } from '../constants.js';
import logger from '../logger.js';

const createEmbodiService = () => {
	const commonHeaders = {
		'Content-Type': 'application/json',
	};

	const login = async (user: string, pass: string) => {
		const endpoint = `${EMBODI_AUTH_URL}/users/login`;
		logger.writeLog('info', `logging into embodi ${endpoint}`);

		const auth = {
			username: user,
			password: pass,
		};

		const options = {
			method: 'POST',
			headers: {
				...commonHeaders,
			},
			body: JSON.stringify(auth),
		};

		let json: any = undefined;
		try {
			const res = await fetch(`${endpoint}`, options);

			if (!res.ok) {
				const text = await res.text();
				logger.writeLog('error', `error: ${res.status} ${text}`);
				return undefined;
			}

			json = await res.json();
		} catch (error) {
			if (error instanceof SyntaxError) {
				logger.writeLog('error', `syntax error: ${error}`);
			} else {
				logger.writeLog('error', `error: ${error}`);
			}

			return undefined;
		}

		if (json && json.success === true) {
			const embodi = {
				...json,
				lastRefresh: new Date().getTime(),
			};
			registry.set('embodiAuth', embodi);

			console.log(registry.get('embodiAuth'));

			return embodi;
		}
	};

	const checkAvailability = async (start: number, end: number, id: string) => {
		const endpoint = `${EMBODI_API_URL}/ghl/appointment/get-availabilities`;
		const query = `?location_id=${id}&start_time=${start}&end_time=${end}`;

		logger.writeLog('info', `requesting availabilities ${endpoint}${query}`);

		const auth = registry.get('embodiAuth');
		if (!auth || auth.token.length === 0) {
			logger.writeLog('error', `no valid login with embodi returning`);
			return undefined;
		}

		const options = {
			method: 'GET',
			headers: {
				Authorization: 'Bearer ' + auth.token,
				...commonHeaders,
			},
		};

		let json: any = undefined;
		try {
			const res = await fetch(`${endpoint}${query}`, options);

			if (!res.ok) {
				const text = await res.text();
				logger.writeLog('error', `error: ${res.status} ${text}`);
				return undefined;
			}

			json = await res.json();
		} catch (error) {
			if (error instanceof SyntaxError) {
				logger.writeLog('error', `syntax error: ${error}`);
			} else {
				logger.writeLog('error', `error: ${error}`);
			}
		}

		if (json) return json;

		return undefined;
	};

	const scheduleAppointment = async (start: number, end: number, id: string) => {
		const endpoint = `${EMBODI_API_URL}/ghl/appointment/create`;
		const query = `?contact_id=${id}&start_time=${start}&end_time=${end}`;

		const auth = registry.get('embodiAuth');
		if (!auth || auth.token.length === 0) {
			logger.writeLog('error', `no valid login with embodi returning`);
			return undefined;
		}

		const options = {
			method: 'POST',
			headers: {
				Authorization: 'Bearer ' + auth.token,
				...commonHeaders,
			},
		};

		let json: any = undefined;
		let res;
		try {
			res = await fetch(`${endpoint}${query}`, options);

			if (!res.ok) {
				const text = await res.text();
				logger.writeLog('error', `error: ${res.status} ${text}`);
				return undefined;
			}

			json = await res.json();
		} catch (error) {
			if (error instanceof SyntaxError) {
				logger.writeLog('error', `syntax error: ${error}`);
			} else {
				logger.writeLog('error', `error: ${error}`);
			}
		}

		if (json) return { status: res?.status, data: json };

		return undefined;
	};

	return {
		login,
		checkAvailability,
		scheduleAppointment,
	};
};

export const embodiService = createEmbodiService();
