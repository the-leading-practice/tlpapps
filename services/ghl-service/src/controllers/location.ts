import express from 'express';
// import { GHLService } from 'services/ghl';

const createLocationController = () => {
	const getLocation = (req: express.Request, res: express.Response) => {};

	return {
		getLocation,
	};
};

export const locationController = createLocationController();
