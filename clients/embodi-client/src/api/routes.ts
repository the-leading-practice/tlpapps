import { Application } from 'express';
import { embodiController } from 'controllers/embodiController.js';

export const routes = (app: Application) => {
	app.route('/').get(embodiController.index);
	app.route('/calendar/availability/:date/:id').get(embodiController.getAvailability);
	app.route('/calendar/appointment').post(embodiController.createAppointment);
	app.route('/calendar/updated').post(embodiController.updateCalendar);
};
