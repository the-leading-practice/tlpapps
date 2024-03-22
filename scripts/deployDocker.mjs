#!/user/bin/env node
import fs from 'fs';
import path from 'path';
import {
  intro,
  cancel,
  isCancel,
  confirm,
  text 
} from '@clack/prompts';
import { cyan, gray, bold } from 'kleur/colors';

const srcDir = '../serverContainer';
const srcFiles = [
  'build-services.sh',
  'tlpservices.sh',
  'docker-compose.yml'
];

const getFullPath = ( dest ) => {
  let fullPath = dest;
  if( dest.substr( 0, 2 ) === '..' ) {
    fullPath = path.join( process.cwd(), dest );
  }
  console.log( fullPath );

  return fullPath;
}


intro( `Build and Deploy Docker Container` );

let destination = await text( {
  message: 'docker installation directory:',
  placeholder: 'destination directory',
  initialValue: '',
  validate( value ) {
    if( value.length === 0 ) return 'error: directory cannot be empty';
  }
} );

if( isCancel( destination ) ) {
  cancel( 'deployment cancelled' );
  process.exit( 0 );
}

destination = getFullPath( destination );

const doInstall = await confirm( {
  message: `Deploy docker container to ${destination}`,
} );

if( isCancel( doInstall ) ) {
  cancel( 'deployment cancelled' );
  process.exit( 0 );
}

if( doInstall ) {
  
  // make sure dir exists
  console.log( process.cwd() );
  if( !fs.existsSync( destination ) ) {
    console.log( gray( `${destination} does not exist\ncreating directory...` ) );
    fs.mkdirSync( destination, {recursive:true} );

  }

  // move docker files to directory
  for( let file in srcFiles ) {
    const srcPath = path.join( srcDir, file );
    const destPath = path.join( destination, file );

    // fs.copyFileSync( srcPath, destPath );
  }

  // run build as root

  let instructions = bold( cyan( `\nDone! To start the container:\n\n` ) );
  instructions += bold( cyan( `cd ${destination}\n` ) );
  instructions += bold( cyan( `su tlpservices.sh start\n\n` ) )

  console.log( instructions );
}
