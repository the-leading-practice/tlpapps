import { Application } from 'express';
import { controller } from '../controllers/controller.js';

export const routes = (app: Application) => {
	app.route('/webhook/appointment-create').post(controller.hook);
	app.route('/webhook/echo').post(controller.index);
	app.route('/webhook/sample').get(controller.sample);
};
