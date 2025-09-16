import logger from '../logger.js';

const createEmbodiService = () => {
	const commonHeaders = {
		'Content-Type': 'application/json',
	};

	const login = async (user: string, pass: string) => {
		const endpoint = `https://staging-auth.kaizenovate.net/users/login`;

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
			json = await res.json();
		} catch (error) {
			if (error instanceof SyntaxError) {
				logger.writeLog('error', `syntax error: ${error}`);
			} else {
				logger.writeLog('error', `error: ${error}`);
			}
		}

		if (json && json.success === true) {
			global.token = json.token;
			global.delay = json.delay;
			global.lastTokenRefresh = new Date().getTime();
		}
	};

	const checkAvailability = async (start: number, end: number, id: string) => {
		const endpoint = 'https://staging.portal.embodihealth.com/ghl/appointment/get-availabilities';
		const query = `?location_id=${id}&start_time=${start}&end_time=${end}`;

		const options = {
			method: 'GET',
			headers: {
				Authorization: 'Bearer ' + global.token,
				...commonHeaders,
			},
		};

		let json: any = undefined;
		try {
			const res = await fetch(`${endpoint}${query}`, options);

			if (!res.ok) return undefined;
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
		const endpoint = 'https://staging.portal.embodihealth.com/ghl/appointment/create';
		const query = `?contact_id=${id}&start_time=${start}&end_time=${end}`;

		const options = {
			method: 'GET',
			headers: {
				Authorization: 'Bearer ' + global.token,
				...commonHeaders,
			},
		};

		let json: any = undefined;
		let res;
		try {
			res = await fetch(`${endpoint}${query}`, options);
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
