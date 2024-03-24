import { service } from 'service';
import { dbConnector } from 'services/mongodb';

dbConnector.connect();
service.start();

