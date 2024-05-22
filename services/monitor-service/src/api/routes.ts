import { Application } from 'express';
import { controller } from 'controllers/controller';

export const routes = ( app: Application ) => {
  app.route( '/monitor/info' ).get( controller.info );
  app.route( '/monitor/stats' ).get( controller.stats );

	// container control
}
