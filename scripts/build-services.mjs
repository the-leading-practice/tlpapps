#!/user/bin/env node
/**
 * App services build script
 * 
 * version: 2024.03.20
 */
import {
  intro,
} from '@clack/prompts';
import { installServices } from './utils/service-utils.mjs';

//--[ install variables ]------------------------------------------------------
let dockerDir = '';

const parseArgs = () => {
  const argv = process.argv.slice( 2 );

  if( argv.length > 0 ) {
    // assume this to be the docker-contianer dir
    dockerDir = argv[0];
    return;
  }
}

intro( `Build services script` );
parseArgs();

installServices( dockerDir, true );
