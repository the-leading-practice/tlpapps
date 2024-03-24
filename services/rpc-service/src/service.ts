import express from 'express';
import type { Config } from 'types/config';
import { routes } from 'api/routes';
import { websocketServer } from './socket';

export const createService = ( config: Config ) => {
  const app = express();
  const port = config.service.port;
  const name = config.service.name;
  let wsServer: any;

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

    // start the webservice
    wsServer = websocketServer;
  }

  const shutdown = () => {

  }

  const heartbeat = () => {
    wsServer.pingClients();
  }

  const pingTimer = setInterval( heartbeat, config.service.pingInterval * 1000 )

  return {
    start,
    shutdown
  };
}