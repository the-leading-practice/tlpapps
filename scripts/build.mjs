#!/user/bin/env node
/**
 * TLP Apps full build script
 * 
 * version: 2024.03.20
 */

import fs from 'fs';
import {
  intro,
  cancel,
  isCancel,
  text 
} from '@clack/prompts';
import { installDocker } from './utils/docker-utils.mjs';
import { installServices } from './utils/service-utils.mjs';
import { getFullPath } from './utils/utils.mjs';

let dockerDir = '';

const parseArgs = () => {
  const argv = process.argv.slice( 2 );

  if( argv.length > 0 ) {
    // assume this to be the docker-contianer dir
    dockerDir = argv[0];
    return;
  }
}

intro( `Install TLP Apps Services` );
parseArgs();

//--[ Desintation path ]-------------------------------------------------------
let destination = await text( {
  message: 'Installation directory:',
  placeholder: 'destination directory',
  initialValue: dockerDir,
  validate( value ) {
    if( value.length === 0 ) return 'error: directory cannot be empty';
  }
} );

if( isCancel( destination ) ) {
  cancel( 'deployment cancelled' );
  process.exit( 0 );
}

destination = getFullPath( destination );

// make sure dir exists
if( !fs.existsSync( destination ) ) {
  console.log( gray( `\n\n${destination} does not exist\ncreating directory...\n` ) );
  fs.mkdirSync( destination, {recursive:true} );
}

// install and build the services first
await installServices( destination );

// build and deploy the docker container
await installDocker( destination );