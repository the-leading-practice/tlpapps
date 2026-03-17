/**
 * GHL / Integration route definitions.
 * Ported from ghl-service/src/api/routes.ts.
 *
 * Mount under /api/ghl in server.ts.
 */
import { Router } from 'express';
import { contactController } from './contactController.js';
import { apptController } from './apptController.js';
import { calendarController } from './calendarController.js';

const router = Router();

// Contact routes
router.post('/contact/', contactController.createContact);
router.get('/contact/:id', contactController.getContact);
router.put('/contact/:id', contactController.updateContact);
router.get('/contacts/:query', contactController.findContacts);

// Appointment routes (contact-scoped)
router.get('/contact/appointments/:id', apptController.getContactAppointments);

// Appointment routes
router.get('/appointment/:id', apptController.getAppointment);
router.put('/appointment/', apptController.updateAppointment);
router.post('/appointment/', apptController.createAppointment);

// Calendar block routes
router.get('/calendar/block', calendarController.getBlocks);
router.post('/calendar/block', calendarController.createBlock);
router.delete('/calendar/block', calendarController.deleteBlock);

export default router;
