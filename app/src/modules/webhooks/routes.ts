import { Router } from 'express';
import { webhookController } from './controller.js';

const router = Router();

router.post('/webhook', webhookController.hook);
router.post('/webhook/appointment-create', webhookController.appointmentCreate);
router.post('/webhook/echo', webhookController.index);
router.get('/webhook/sample', webhookController.sample);

export default router;
