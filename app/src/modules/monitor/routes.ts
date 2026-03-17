import { Router } from 'express';
import { monitorController } from './controller.js';

const router = Router();

router.get('/monitor/list', monitorController.list);
router.get('/monitor/info', monitorController.info);
router.get('/monitor/stats/:id', monitorController.stats);

export default router;
