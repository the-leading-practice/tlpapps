import { Router } from 'express';
import { adminController } from './controller.js';

const router = Router();

// Practices (accessTokens)
router.get('/admin/practices', adminController.listPractices);
router.get('/admin/practices/:location', adminController.getPractice);
router.post('/admin/practices', adminController.createPractice);
router.put('/admin/practices/:location', adminController.updatePractice);
router.delete('/admin/practices/:location', adminController.deletePractice);

// Practice stats
router.get('/admin/practices/:location/stats', adminController.getPracticeStats);

// Dashboard overview
router.get('/admin/dashboard', adminController.getDashboard);

// EHR configs
router.get('/admin/ehr/drchrono', adminController.getDrChronoConfigs);
router.get('/admin/ehr/silkone', adminController.getSilkOneConfig);

export default router;
