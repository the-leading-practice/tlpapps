import { Application } from 'express';
import { embodiController } from '../controllers/embodiController.js';

export const routes = (app: Application) => {
	app.route('/embodi/calendar/availability/:date/:id').get(embodiController.getAvailability);
	app.route('/embodi/calendar/createdAppointment').post(embodiController.createAppointment);
	app.route('/embodi/calendar/updated').post(embodiController.updateCalendar);
};
