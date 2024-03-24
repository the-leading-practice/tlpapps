import { Application } from 'express';
import { controller } from 'controllers/controller';

export const routes = ( app: Application ) => {
  app.route( '/' ).get( controller.index );

  app.route( '/configs' ).get( controller.getAllConfigs );

  app.route( '/config/:location' )
    .get( controller.getConfig )
    .post( controller.updateConfig )
}
