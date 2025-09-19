import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_USER = process.env.MONGO_USER || '';

const MONGO_PASS = process.env.MONGO_PASS || '';

export const MONGO_DB = process.env.MONGO_DB || '';

export const MONGO_DB_CONN_STRING = process.env.MONGO_CONN_STRING
	? `${process.env.MONGO_CONN_STRING.replace(/%USER%/g, MONGO_USER).replace(/%PW%/g, encodeURIComponent(MONGO_PASS))}/${MONGO_DB}`
	: '';

export const TELEGRAM_BOT_KEY = process.env.TELEGRAM_BOT_KEY || '';
export const TELEGRAM_BOT_GROUP_ID = process.env.TELEGRAM_BOT_GROUP_ID || '';
export const POST_LEVEL = process.env.POST_LEVEL || 'error';

export const CLICKUP_API_KEY =
	process.env.CLICKUP_API_KEY || 'pk_10792315_G0MD0BMD1UBYHQDLRWSSVJESQEAGI4SG';
export const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID || '8555762';
export const CLICKUP_CHANNEL_ID = process.env.CLICKUP_CHANNEL_ID || '8537j-130837';
