import { Application } from 'express';
import { controller } from '../controllers/controller.js';
import { accountController } from '../controllers/account.js';

export const routes = (app: Application) => {
	// default
	app.route('/').get(controller.index);

	// tlp api login
	app.route('/login').post(controller.login);
	app.route('/idm/auth').post(controller.auth); // does not renew token

	// signin account
	app.route('/signin').post(accountController.signin);

	// verify account
	app.route('/verify/:email').get(accountController.verify);

	// update account
	app.route('/update').post(accountController.update);

	// register account
	app.route('/register').post(accountController.register);

	// ghl outh access token callback
	app.route('/idm/oauth').get(controller.oauth);
	app.route('/idm/oauth/*').get(controller.oauth);
};
