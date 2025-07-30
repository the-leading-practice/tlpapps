import { gateway } from 'gateway';
import getConfig from 'config';
import type { Config } from 'types/config';

const config: Config = getConfig();

const gw = gateway(config);
gw.start();
