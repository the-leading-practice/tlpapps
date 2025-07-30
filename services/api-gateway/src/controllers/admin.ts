import express from 'express';
import getConfig from 'config';
import type { Config } from 'types/config';
import { idmService } from 'services/idmService';

export const admin = (config: Config) => {
	const app = async (req: express.Request, res: express.Response) => {
		res.render('status', { services: config.services });
	};

	const auth = async (req: any, res: express.Response) => {
		const config = getConfig();
		const idm = config.services.find((ep) => ep.endpoint === config.authEndpoint.service);

		if (idm) {
			idmService
				.login(req.body, idm, config.authEndpoint)
				.then((resp) => {
					res.status(200).json(resp);
				})
				.catch((error) => {
					res.status(502).json({});
				});
		}
	};

	return {
		app,
		auth,
	};
};
