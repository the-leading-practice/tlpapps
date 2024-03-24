import { Application } from 'express';
import { controller } from 'controllers/controller';

export const routes = ( app: Application ) => {
  app.route( '/webhook/hook' ).post( controller.hook );
  app.route( '/webhook/echo' ).post( controller.index );
  app.route( '/webhook/sample' ).get( controller.sample );
}
