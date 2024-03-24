import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_USER = process.env.MONGO_USER || '';
const MONGO_PASS = process.env.MONGO_PASS || '';
export const MONGO_DB = process.env.MONGO_DB || '';
export const MONGO_DB_CONN_STRING = process.env.MONGO_CONN_STRING ? `${process.env.MONGO_CONN_STRING.replace( /%USER%/g, MONGO_USER ).replace( /%PW%/g, MONGO_PASS )}/${MONGO_DB}` : "";

