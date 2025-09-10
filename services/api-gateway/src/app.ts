import { gateway } from './gateway.js';
import getConfig from './config.js';
import type { Config } from './types/config.js';

const config: Config = getConfig();

const gw = gateway(config);
gw.start();
