import { Application } from 'express';
import { contactController } from '../controllers/contact.js';
import { locationController } from '../controllers/location.js';
import { apptController } from '../controllers/appt.js';
import { calendarController } from '../controllers/calendar.js';

export const routes = (app: Application) => {
	app.route('/ghl/contact/').post(contactController.createContact);

	app.route('/ghl/contact/:id').get(contactController.contact).put(contactController.updateContact);

	app.route('/ghl/contacts/:query').get(contactController.findContact);

	app.route('/location/:locationId').get(locationController.getLocation);

	app.route('/ghl/contact/appointments/:id').get(apptController.getAppointmentsForContact);

	app.route('/ghl/appointment:id').get(apptController.getAppointment);

	app.route('/ghl/calendar/block').post(calendarController.createBlock);

	app.route('/ghl/calendar/blocks').get(calendarController.getBlockedSlots);

	app
		.route('/ghl/appointment/')
		.put(apptController.updateAppointment)
		.post(apptController.createAppointment);
};
