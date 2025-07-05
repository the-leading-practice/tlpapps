import { load } from 'js-yaml';
import * as fs from 'fs';
import type { Config } from './types';

const getConfig = () : Config => {
  const contents = fs.readFileSync( 'config/client.config.yml', 'utf8' );
  const data: Config = load( contents ) as Config;
  
  console.log( data );
  return data;
}

export default getConfig;
