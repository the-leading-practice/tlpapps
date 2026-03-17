import { Router } from 'express';
import { notificationController } from './controller.js';

const router = Router();

router.post('/notification', notificationController.notify);

export default router;
