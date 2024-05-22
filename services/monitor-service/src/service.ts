import express from 'express';
import type { Config } from 'types/config';
import { routes } from 'api/routes';

export const createService = ( config: Config ) => {
  const app = express();
  const port = config.service.port;
  const name = config.service.name;

  const start = () => {
    // TODO: add auth here

    // load up middleware here
    app.use( express.json() );
    app.use( express.urlencoded( { extended: true } ) ); 
    
    // load routes
    routes( app );

    // start the service
    app.listen( port, () => {
      return console.log( `${name} is listening at http://localhost:${port}` );
    } );
  }

  const shutdown = () => {

  }

  return {
    start,
    shutdown
  };
}