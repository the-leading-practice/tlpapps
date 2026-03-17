import { Router } from 'express';
import { embodiController } from './controller.js';

const router = Router();

router.get('/embodi/calendar/availability/:date/:id', embodiController.getAvailability);
router.post('/embodi/calendar/createdAppointment', embodiController.createAppointment);
router.post('/embodi/calendar/updated', embodiController.updateCalendar);

export default router;
