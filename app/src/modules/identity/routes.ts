import { Router } from 'express';
import { controller } from './controller.js';
import { accountController } from './account.js';

const router = Router();

router.get('/', controller.index);
router.post('/login', controller.login);
router.post('/idm/auth', controller.auth);
router.get('/idm/oauth', controller.oauth);
router.post('/idm/location/auth', controller.locationAuth);
router.post('/signin', accountController.signin);
router.get('/verify/:email', accountController.verify);
router.post('/update', accountController.update);
router.post('/register', accountController.register);

export default router;
