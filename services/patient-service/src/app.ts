import { service } from './service.js';
import { dbConnector } from './services/mongodb.js';

dbConnector.connect();
service.start();
