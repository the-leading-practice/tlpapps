import express from 'express';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { routes } from 'api/routes';
import { Config } from 'types/config';

export const service = ( config: Config) => {
  const app = express();
  const port = config.service.port;

  const start = () => {
    // load up middleware here
    app.set( 'view engine', 'ejs' );
    app.set( 'views', path.join( __dirname, 'public' ) );

    // TODO: add auth 

    app.use( express.json() );
    app.use( express.urlencoded( { extended: true } ) ); 
    
    // load routes
    routes( app );

    app.listen( port, () => {
      return console.log( `${config.service.name} is listening at http://localhost:${port}` );
    } );
  }

  return{
    start
  }
}