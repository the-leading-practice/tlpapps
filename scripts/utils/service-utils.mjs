import fs from 'fs';
import path from 'path';
import {
  cancel,
  isCancel,
  confirm,
  multiselect,
  text 
} from '@clack/prompts';
import { runCommand, getFullPath } from './utils.mjs';
import { cyan, gray, bold } from 'kleur/colors';

const sourceDir = "services";

const buildService = ( service ) => {
  const orig = process.cwd();
  const src = path.join( process.cwd(), sourceDir, service );
  const status = gray( 'building ' ) + cyan( service ) + gray( ' ...' );

  process.chdir( src );
  console.log( status );
  runCommand( 'pnpm run build' );
  process.chdir( orig );
}

const moveService = ( service, destination ) => {
  const orig = process.cwd();
  const src = path.join( process.cwd(), sourceDir, service, "dist" );
  const dockerSrc = path.join( process.cwd(), sourceDir, service, 'Dockerfile' );
  const packageSrc = path.join( process.cwd(), sourceDir, service, 'package.json' );
  const dest = path.join( destination, service, "dist" );

  if( !fs.existsSync( dest ) ) {
    console.log( gray( `\n\n${dest} does not exist\ncreating directory...\n` ) );
    fs.mkdirSync( dest, {recursive:true} );
  }

  // dest dir
  fs.cpSync( src, dest, {recursive:true} );

  // docker file
  fs.copyFileSync( dockerSrc, path.join( destination, service, 'Dockerfile' ) );

  // package file
  fs.copyFileSync( packageSrc, path.join( destination, service, 'package.json' ) );
}

export const installServices = async ( destination, selectDestDir=false ) => {
  //--[ Desintation path ]-------------------------------------------------------
  if( selectDestDir ) {
    destination = await text( {
      message: 'docker installation directory:',
      placeholder: 'destination directory',
      initialValue: destination,
      validate( value ) {
        if( value.length === 0 ) return 'error: directory cannot be empty';

        const composeFile = path.join( getFullPath( value ), "docker-compose.yml" );
        if( !fs.existsSync( composeFile ) ) {
          return "error: does not appear to be a docker directory"
        }
      }
    } );

    if( isCancel( destination ) ) {
      cancel( 'build services cancelled' );
      process.exit( 0 );
    }
  }

  destination = path.join( getFullPath( destination ), "tlpservices" );

  //--[ Select Service to Build ]------------------------------------------------
  const availServices = [
    {value: 'api-gateway', label: 'API Gateway'},
    {value: 'config-service', label: 'Config Service'},
    {value: 'ghl-service', label: 'GHL Service'},
    {value: 'identity-service', label: 'Identity Service'},
    {value: 'notification-service', label: 'Notification Service'},
    {value: 'patient-service', label: 'Patient Service'},
    {value: 'rpc-service', label: 'RPC Service'},
    {value: 'webhook-service', label: 'Webhook Service'}
  ];

  const services = await multiselect( {
    message: 'Select services to build',
    options: availServices
  } );

  if( isCancel( services ) ) {
    cancel( 'build services cancelled' );
    process.exit( 0 );
  }

  const doInstall = await confirm( {
    message: `Build services and move to ${destination}`,
  } );

  if( isCancel( doInstall ) ) {
    cancel( 'build services cancelled' );
    process.exit( 0 );
  }

  if( doInstall ) {
    // make sure dir exists
    if( !fs.existsSync( destination ) ) {
      console.log( gray( `\n\n${destination} does not exist\ncreating directory...\n` ) );
      fs.mkdirSync( destination, {recursive:true} );
    }

    for( const service of services ) {
      // build service
      buildService( service );

      // move service
      moveService( service, destination );
    }
  }
}