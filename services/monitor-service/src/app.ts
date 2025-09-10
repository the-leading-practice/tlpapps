import { createService } from './service.js';
import getConfig from './config.js';

const config = getConfig();

const service = createService(config);
service.start();
