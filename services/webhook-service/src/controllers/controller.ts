import express from 'express';
import { configService } from '../service/config.js';
import { embodiClient } from '../service/embodiClient.js';

const createController = () => {
	const index = (req: express.Request, res: express.Response) => {
		console.log(req.body);
		console.log(req.headers['x-tlp-app-location']);

		res.status(200).json(req.body);
	};

	const hook = (req: express.Request, res: express.Response) => {
		console.log(req.body);
		console.log(req.headers);

		res.sendStatus(200);
	};

	const appointmentCreate = async (req: express.Request, res: express.Response) => {
		// console.log(req.body);
		// console.log(req.headers);
		res.sendStatus(200);

		const config = await configService.getConfig(req.body.locationId);
		if (config && config.config.Software === 'Embodi') {
			console.log('forwarding to embodi-client');
			await embodiClient.createAppointment(req.body);
		}
	};

	const sample = (req: express.Request, res: express.Response) => {
		const ret = {
			message: 'success',
			code: 200,
			page: 'sample',
		};

		res.status(200).json(ret);
	};

	return {
		index,
		hook,
		sample,
		appointmentCreate,
	};
};

export const controller = createController();
