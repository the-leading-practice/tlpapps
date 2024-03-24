import getConfig from './config';
import { createService } from './service';
import { dbConnector } from './services/mongodb';

const config = getConfig();
const service = createService( config );

dbConnector.connect();
service.start();

