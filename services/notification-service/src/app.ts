import getConfig from './config.js';
import { createService } from './service.js';

const config = getConfig();
const service = createService(config);
service.start();
