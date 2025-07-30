import * as dotenv from 'dotenv';
dotenv.config();

export const LISTEN_PORT = process.env.LISTEN_PORT || 8080;
export const CERT_PATH = process.env.CERT_PATH;

export const CLIENT_ID = process.env.CLIENT_ID || '';
export const CLIENT_SECRET = process.env.CLIENT_SECRET || '';

export const REDIRECT_URL =
	process.env.REDIRECT_URL || 'https://tlpapps.theleadingpractice.com:8080/oauth';
export const GHL_API_URL = process.env.GHL_API_URL || 'https://services.leadconnectorhq.com';
export const GHL_API_VERSION = process.env.GHL_API_VERSION || '2021-07-28';

export const TOKEN_KEY = process.env.TOKEN_KEY || '';

const MONGO_USER = process.env.MONGO_USER || '';
const MONGO_PASS = process.env.MONGO_PASS || '';
export const MONGO_DB = process.env.MONGO_DB || '';
export const MONGO_DB_CONN_STRING = process.env.MONGO_CONN_STRING
	? `${process.env.MONGO_CONN_STRING.replace(/%USER%/g, MONGO_USER).replace(/%PW%/g, encodeURIComponent(MONGO_PASS))}/${MONGO_DB}`
	: '';
