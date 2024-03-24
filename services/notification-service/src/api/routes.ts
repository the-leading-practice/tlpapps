import { Application } from 'express';
import { controller } from 'controllers/controller';

export const routes = ( app: Application, log: any ) => {
  app.route( '/' ).get( controller.index );

  app.route( '/notification' )
  .post( ( req, res ) => controller.notify( req, res, log ) );

}
