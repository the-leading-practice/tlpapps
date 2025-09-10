import { requestSync } from '../lib/unixSocketSync.js';

const createDockerService = () => {
	const unixSocket = '/var/run/docker.sock';

	// const _responseOk = ( code: number | undefined ) => {
	// 	return ( code && code >= 200 && code < 400 );
	// }

	const list = async () => {
		const options = {
			socketPath: unixSocket,
			method: 'GET',
			path: '/containers/json',
		};

		const resp = await requestSync(options);

		return {
			status: resp.response?.statusCode || 500,
			data: resp.data,
		};
	};

	const info = async () => {
		const options = {
			socketPath: unixSocket,
			method: 'GET',
			path: '/info',
		};

		// get info from docker service
		const resp = await requestSync(options).catch((error) => {
			console.log(error);
			return {
				response: null,
				data: error,
			};
		});

		return {
			status: resp.response?.statusCode || 500,
			data: resp.data,
		};
	};

	const stats = async (id: string) => {
		const options = {
			socketPath: unixSocket,
			method: 'GET',
			path: `/containers/${id}/stats?stream=false&one-shot=true`,
		};

		// get stats for provided container
		const resp = await requestSync(options).catch((error) => {
			console.log(error);
			return {
				response: null,
				data: error,
			};
		});

		return {
			status: resp.response?.statusCode || 500,
			data: resp.data,
		};
	};

	return {
		list,
		info,
		stats,
	};
};

export const dockerService = createDockerService();
