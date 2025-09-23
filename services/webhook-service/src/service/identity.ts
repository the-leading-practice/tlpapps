const createIdentityService = () => {
	const locationAuth = async (data: any) => {
		const url = `http://identity-service:5600/idm/location/auth`;

		const options = {
			method: 'post',
			headers: {
				'Content-type': 'application/json',
			},
			body: JSON.stringify(data),
		};

		const resp = await fetch(url, options);
		if (resp.ok) {
			const config = await resp.json();
			return config;
		}

		return undefined;
	};

	return {
		locationAuth,
	};
};

export const identityService = createIdentityService();
