import { service } from './service.js';
import { dbConnector } from './services/mongodb.js';
import getConfig from './config.js';
import type { Config } from './types/config.js';

const config: Config = getConfig();

dbConnector.connect();

const idm = service(config);
idm.start();
