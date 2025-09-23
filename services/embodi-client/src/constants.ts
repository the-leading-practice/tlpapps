import * as dotenv from 'dotenv';
dotenv.config();

export const CLIENT_ID = process.env.CLIENT_ID || '';
export const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
export const GHL_API_URL = process.env.GHL_API_URL || 'https://services.leadconnectorhq.com';
export const GHL_API_VERSION = process.env.GHL_API_VERSION || '2021-07-28';

export const EMBODI_AUTH_URL =
	process.env.EMBODI_AUTH_URL || 'https://staging-auth.kaizenovate.net';
export const EMBODI_API_URL =
	process.env.EMBODI_API_URL || 'https://staging.portal.embodihealth.com';
export const EMBODI_API_USER = process.env.EMBODI_API_USER || '';
export const EMBODI_API_PASS = process.env.EMBODI_API_PASS || '';

// logging
export const LOG_PATH = process.env.LOG_PATH || './var/logs/embodi-client';
export const LOG_LEVEL: string | number = process.env.LOG_LEVEL || 40;
export const LOG_KEEP_FILES: number = parseInt(
	process.env.LOG_KEEP_FILES ? process.env.LOG_KEEP_FILES : '15',
);
export const LOG_FILE_NAME = process.env.LOG_FILE_NAME || 'embodi-client.log';
export const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE === 'true' || false;

const MONGO_USER = process.env.MONGO_USER || '';
const MONGO_PASS = process.env.MONGO_PASS || '';
export const MONGO_DB = process.env.MONGO_DB || '';
export const MONGO_DB_CONN_STRING = process.env.MONGO_CONN_STRING
	? `${process.env.MONGO_CONN_STRING.replace(/%USER%/g, MONGO_USER).replace(/%PW%/g, encodeURIComponent(MONGO_PASS))}/${MONGO_DB}`
	: '';
