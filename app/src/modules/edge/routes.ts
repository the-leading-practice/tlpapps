import { Router } from 'express';
import { edgeController } from './controller.js';

const router = Router();

router.get('/config/:location/edge', edgeController.getConfig);
router.post('/config/:location/edge', edgeController.upsertConfig);
router.get('/config/:location/edge/mappings', edgeController.getMappings);
router.post('/config/:location/edge/mappings', edgeController.upsertMappings);

export default router;
