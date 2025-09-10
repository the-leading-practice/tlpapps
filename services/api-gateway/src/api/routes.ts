import { Application } from 'express';
import { admin } from '../controllers/admin.js';
import type { Config } from '../types/config.js';
import express from 'express';
import { authToken } from '../middleware/auth.js';

export const routes = (app: Application, config: Config) => {
	const adm = admin(config);

	app.route('/a').all(adm.app);
	app.route('/a/*').all(adm.app);

	app.route('/api/auth').post(adm.auth);

	app.get('/test', authToken, (req: any, res: express.Response) => {
		console.log(req.payload);
		res.status(200).json({});
	});
};
