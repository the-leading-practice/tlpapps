import { service } from 'service';
import { dbConnector } from 'services/mongodb';
import getConfig from 'config';
import type { Config } from 'types/config';

const config: Config = getConfig();

dbConnector.connect();

const idm = service(config);
idm.start();
