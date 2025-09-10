import fs from 'fs';
import path from 'path';
import express from 'express';
import bunyan from 'bunyan';
import RotatingFileStream from 'bunyan-rotating-file-stream';
// import cors from 'cors';

import type { Config } from './types/config.js';
import { routes } from './api/routes.js';

export const createService = (config: Config) => {
	const app = express();
	const port = config.service.port;
	const name = config.service.name;

	const start = () => {
		// create logger
		const fullLogPath = path.join(config.logging.logPath, config.logging.fileName);
		if (config.logging) {
			if (!fs.existsSync(config.logging.logPath)) {
				fs.mkdirSync(config.logging.logPath, { recursive: true });
			}

			if (!fs.existsSync(fullLogPath)) {
				console.log(`need to create file`);
				fs.writeFileSync(fullLogPath, '');
			}
		}

		console.log(fullLogPath);

		const log = bunyan.createLogger({
			name: 'notification-service',
			streams: [
				{
					level: 'warn',
					stream: new RotatingFileStream({
						path: fullLogPath,
						period: '1d',
						totalFiles: 15,
						gzip: true,
					}) as NodeJS.WritableStream,
				},
			],
		});

		// load up middleware here
		app.use(express.json({ type: ['application/json', 'text/plain'] }));
		app.use(express.urlencoded({ extended: true }));

		// app.use( cors( corsOptions ) );

		// load routes
		routes(app, log);

		// start the service
		app.listen(port, () => {
			return console.log(`${name} is listening at http://localhost:${port}`);
		});
	};

	const shutdown = () => {};

	return {
		start,
		shutdown,
	};
};
