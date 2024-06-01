import fs from 'fs';
import path from 'path';
import {
  cancel,
  isCancel,
  confirm,
  text 
} from '@clack/prompts';
import { runCommand, getFullPath } from './utils.mjs';
import { cyan, gray, bold } from 'kleur/colors';

const srcDir = './serverContainer';
const srcFiles = [
  'build-services.sh',
  'tlpservices.sh',
  'docker-compose.yml'
];

const moveDockerFiles = ( destination ) => {
  for( const file of srcFiles ) {
    const srcPath = path.join( srcDir, file );
    const destPath = path.join( destination, file );
    console.log( gray( `copy file ${file} -> ${destPath}` ) );
    fs.copyFileSync( srcPath, destPath );
  }
}

const buildDocker = ( destination, password ) => {
  const cmd = `docker-compose build`;
  const root = process.cwd();

  process.chdir( destination );
  console.log( `now in ${process.cwd()}` );

  runCommand( cmd, password, true );

  process.chdir( root );
  console.log( `now in ${process.cwd()}` );
}

export const installDocker = async ( destination='', selectDestDir=false ) => {
  if( selectDestDir ) {
    //--[ Desintation path ]-------------------------------------------------------
    destination = await text( {
      message: 'docker installation directory:',
      placeholder: 'destination directory',
      initialValue: destination,
      validate( value ) {
        if( value.length === 0 ) return 'error: directory cannot be empty';
      }
    } );

    if( isCancel( destination ) ) {
      cancel( 'deployment cancelled' );
      process.exit( 0 );
    }
  }

  destination = getFullPath( destination );

  //--[ SUDO password ]----------------------------------------------------------
  const password = await text( {
    message: "sudo password for docker-compose:",
    placeholder: "password",
    validate( value ) {
      if( value.length === 0 ) return 'error: password is required to build docker';
    }
  } );

  if( isCancel( password ) ) {
    cancel( 'deployment cancelled' );
    process.exit( 0 );
  }

  const doInstall = await confirm( {
    message: `Deploy docker container to ${destination}`,
  } );

  if( isCancel( doInstall ) ) {
    cancel( 'deployment cancelled' );
		
    process.exit( 0 );
  }

  if( doInstall ) {
    // make sure dir exists
    if( !fs.existsSync( destination ) ) {
      console.log( gray( `\n\n${destination} does not exist\ncreating directory...\n` ) );
      fs.mkdirSync( destination, {recursive:true} );
    }

    // move docker files to directory
    moveDockerFiles( destination );

    // run build as root
    console.log( gray( `building docker-compose.yml` ) );
    buildDocker( destination, password );

    let instructions = bold( cyan( `\nDone!\n\n` ) );

		instructions += bold( cyan( `Next steps:\n\n` ) );
		
		instructions += bold( cyan( `copy the sample environment file to ${destination}\n` ) );
		instructions += bold( cyan( `cp serverContainer/sample.env ${destination}/.env\n\n` ) );

		instructions += bold( cyan( `edit the ${destination}/.env file\n` ) );
		
		instructions += bold( cyan( `To start the container:\n\n` ) );
    
		instructions += bold( cyan( `cd ${destination}\n` ) );
    instructions += bold( cyan( `sudo tlpservices.sh start\n\n` ) )

    console.log( instructions );
  }
}