#!/user/bin/env node
/**
 * Docker build and deploy script
 * 
 * version: 2024.03.20
 */
import {
  intro,
} from '@clack/prompts';
import { installDocker } from './utils/docker-utils.mjs';

let dockerDir = '';

const parseArgs = () => {
  const argv = process.argv.slice( 2 );

  if( argv.length > 0 ) {
    // assume this to be the docker-contianer dir
    dockerDir = argv[0];
    return;
  }
}

intro( `Deploy Docker Container` );
parseArgs();

installDocker( dockerDir, true );