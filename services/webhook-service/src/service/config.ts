const createConfigService = () => {
	const getConfig = async (location: string) => {
		const url = `http://localhost:5650/config/${location}`;

		const options = {
			method: 'get',
			headers: {
				'Content-type': 'application/json',
			},
		};

		const resp = await fetch(url, options);
		if (resp.ok) {
			const config = await resp.json();
			return config;
		}

		return undefined;
	};

	return {
		getConfig,
	};
};

export const configService = createConfigService();
