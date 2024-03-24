import { Application } from 'express';
import { controller } from 'controllers/controller';

export const routes = ( app: Application ) => {
  app.route( '/echo' ).post( controller.index );
  app.route( '/sample' ).get( controller.sample );
}
