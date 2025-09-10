import registry from 'registry.js';

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

	const addBlock = (start: Date, end: Date) => {
		console.log({
			start: start.toISOString(),
			end: end.toISOString(),
		});
	};

	return {
		login,
		addBlock,
	};
};

export const tlpService = createTLPService();
