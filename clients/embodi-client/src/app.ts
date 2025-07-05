import getConfig from './config';
import { createWSClient } from 'wsclient';
import { API_KEY } from 'lib/constants';
import { createSilkOneClient } from 'silkOneClient';
import { dbConnector } from 'services/mongodb';

console.log( API_KEY );
const config = getConfig();

// mongodb connector
dbConnector.connect();

// silkOneClient
const silkOneClient = createSilkOneClient();
silkOneClient.init();

// RPC client
// const client = createWSClient( config );
// client.start();