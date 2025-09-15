import express from 'express';
import getConfig from './config.js';
import type { Config } from './types/config.js';
import { routes } from './api/routes.js';
import { logger } from './logger.js';

const createService = () => {
	const app = express();
	const config: Config = getConfig();
	const port = config.service.port;

	const start = () => {
		// load up middleware here
		app.use(express.json());
		app.use(express.urlencoded({ extended: true }));

		// load routes
		routes(app);

		// start the service
		app.listen(port, () => {
			return console.log(`${config.service.name} is listening at http://localhost:${port}`);
		});

		logger.writeLog('info', 'createService()', `starting ghl-service`);
	};

	const shutdown = () => {};

	return {
		start,
		shutdown,
	};
};

export const service = createService();
