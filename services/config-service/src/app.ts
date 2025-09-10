import getConfig from './config.js';
import { createService } from './service.js';
import { dbConnector } from './services/mongodb.js';

const config = getConfig();
const service = createService(config);

dbConnector.connect();
service.start();
