import express from 'express';
import { configService } from '../service/config.js';
import { embodiClient } from '../service/embodiClient.js';
import { identityService } from '../service/identity.js';

const createController = () => {
	const index = (req: express.Request, res: express.Response) => {
		res.status(200).json({ success: true });
		const data = { ...req.body };

		if (data.type.toLowerCase() === 'install') {
			install(data);
		}
	};

	const hook = (req: express.Request, res: express.Response) => {
		console.log(req.body);
		console.log(req.headers);

		res.status(200).json({ success: true });
	};

	const appointmentCreate = async (req: express.Request, res: express.Response) => {
		// console.log(req.body);
		// console.log(req.headers);
		res.status(200).json({ success: true });

		const config = await configService.getConfig(req.body.locationId);
		if (config && config.config.Software === 'Embodi') {
			console.log('forwarding to embodi-client');
			await embodiClient.createAppointment(req.body);
		}
	};

	const install = async (data: any) => {
		console.log('install hook triggered forwarding to identity service');
		await identityService.locationAuth(data);
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
