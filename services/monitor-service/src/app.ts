import { createService } from './service';
import getConfig from 'config';

const config = getConfig();

const service = createService( config );
service.start();

