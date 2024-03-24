import getConfig from './config';
import { createService } from './service';

const config = getConfig();
const service = createService( config );
service.start();

