import express from 'express';
import cors from 'cors';
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

		// cors
    var corsOptions = {
      origin: "http://localhost:3000",
      optionsSuccessStatus: 200
    };

		app.use( cors( corsOptions ) );
    
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