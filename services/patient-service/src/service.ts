import express from 'express';
import compression from 'compression';
import getConfig from 'config';
import type { Config } from 'types/config';
import { routes } from 'api/routes';
import { logger } from './logger';

const createService = () => {
  const app = express();
  app.use( express.json() );
  app.use( express.urlencoded( { extended: true } ) );
  app.use( compression() );

  const config: Config = getConfig();
  const port = config.service.port;

  const start = () => {

    // load up middleware here
    app.use( express.json() );
    app.use( express.urlencoded( { extended: true } ) ); 
    
    // load routes
    routes( app );

    // start the service
    app.listen( port, () => {
      return console.log( `${config.service.name} is listening at http://localhost:${port}` );
    } );

    logger.writeLog( 'info', `starting patient-service` );
  }

  const shutdown = () => {

  }

  return {
    start,
    shutdown
  };
}

export const service = createService();

