/**
 * Patient + Appointment route definitions.
 * Ported from patient-service/src/api/routes.ts.
 *
 * Mount under /api/patient and /api/appt in server.ts.
 */
import { Router } from 'express';
import { authToken } from '../../middleware/auth.js';
import { patientController } from './controller.js';
import { appointmentController } from './appointmentController.js';

const router = Router();

// Health / index
router.get('/', patientController.index);

// Patient routes
router.post('/patient', authToken, patientController.createPatient);
router.get('/patient/:id', authToken, patientController.patient);
router.post('/patient/:id', authToken, patientController.updatePatient);
router.delete('/patient/:id', authToken, patientController.deletePatient);

// Appointment routes
router.get('/appt', authToken, appointmentController.appointments);
router.post('/appt', authToken, appointmentController.createAppointments);
router.get('/appt/:id', authToken, appointmentController.appointment);
router.delete('/appt/:id', authToken, appointmentController.deleteAppt);

export default router;
