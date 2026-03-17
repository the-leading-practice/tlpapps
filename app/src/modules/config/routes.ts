import { Router } from 'express';
import { configController } from './controller.js';

const router = Router();

router.get('/configs', configController.getAllConfigs);
router.get('/config/:location', configController.getConfig);
router.post('/config/:location', configController.updateConfig);

export default router;
