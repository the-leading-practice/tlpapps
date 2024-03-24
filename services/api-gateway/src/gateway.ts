import express from 'express';
import path from 'path';
import type { Config } from 'types/config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import morgan  from 'morgan';
import { routes } from 'api/routes';
import { authToken } from 'middleware/auth';
import helmet from 'helmet';

export const gateway = ( appConfig: Config ) => {
  const app = express();
  const config = appConfig;

  const httpOpt = config.protocols.find( p => p.name === "http" );
  
  const setupEndpoints = () => {
    config.services.forEach( service => {
      let url = service.host;
      url += service.port ? `:${service.port}` : "";
      url += service.target ? `/${service.target}` : "";

      let endpoint = `/api/${service.endpoint}`
      
      console.log( `api: /${service.endpoint} target: ${url}` );
      if( service.enabled ){
        if( service.auth ) {
          app.use( endpoint, authToken, createProxyMiddleware( {
            target: url,
            pathRewrite: ( path ) => {
              return path.replace( '/api/', "/" );
            },
            onProxyReq: ( proxyReq, req, res ) => {
              const r: any = req;
              // const tkn = JSON.parse( r.payload.token );
              proxyReq.setHeader( 'x-tlp-app-location', `${r.payload.location} ${r.payload.token}` );
              proxyReq.setHeader( 'x-tlp-app-calendar', `${r.payload.calendar}` );
              proxyReq.setHeader( 'x-tlp-app-timezone', `${r.payload.timezone}` );
              proxyReq.setHeader( 'x-tlp-app-name', `${r.payload.name}` );
              proxyReq.setHeader( 'x-tlp-app-software', `${r.payload.software}` )
              proxyReq.setHeader( 'x-tlp-app-jwt', `${r.jwt}` );

              if( r.payload.pushGHL ) { // if header exists push data to GHL
                proxyReq.setHeader( 'x-tlp-app-pushghl', `yes` );
              }

              if( r.payload.pushAppt ) { // if header exists push data to GHL
                proxyReq.setHeader( 'x-tlp-app-pushappt', `yes` );
              }

              if( r.payload.pushPat ) { // if header exists push data to GHL
                proxyReq.setHeader( 'x-tlp-app-pushpat', `yes` );
              }

            }
          } ) );
        }
        else {
          app.use( endpoint, createProxyMiddleware( {
            target: url,
            pathRewrite: ( path ) => {
              return path.replace( '/api/', "/" );
            }
          } ) );
        }
      }
    } );
  }

  const start = () => {
    // logging
    app.use( morgan( 'combined' ) );

    app.use( helmet() );

    // load up middleware here
    app.set( 'view engine', 'ejs' );
    app.set( 'views', path.join( __dirname, 'public' ) );

    setupEndpoints();

    app.use( express.json() );
    app.use( express.urlencoded( { extended: true } ) ); 

    // load routes
    routes( app, config );

    if( httpOpt && httpOpt.enabled ){
       app.listen( httpOpt.port, () => {
         return console.log( `app-gateway is listening at ${httpOpt.hostname ? httpOpt.hostname : ""}:${httpOpt.port}` );
       } );
    }
  }

  const shutdown = () => {

  }

  return {
    start,
    shutdown
  };
}
