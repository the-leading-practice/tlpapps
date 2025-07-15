import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_USER = process.env.MONGO_USER || '';
const MONGO_PASS = process.env.MONGO_PASS || '';
export const MONGO_DB = process.env.MONGO_DB || '';
export const MONGO_DB_CONN_STRING = process.env.MONGO_CONN_STRING 
  ? `${process.env.MONGO_CONN_STRING.replace( /%USER%/g, MONGO_USER ).replace( /%PW%/g, encodeURIComponent( MONGO_PASS ) )}/${MONGO_DB}` : "";

export const TLP_API_URL = process.env.TLP_API_URL || '';

// logging
export const LOG_PATH = process.env.LOG_PATH || '/var/logs/patient-service';
export const LOG_LEVEL: string | number = process.env.LOG_LEVEL || 40;
export const LOG_KEEP_FILES: number = parseInt( process.env.LOG_KEEP_FILES ? process.env.LOG_KEEP_FILES : '15' );
export const LOG_FILE_NAME = process.env.LOG_FILE_NAME || 'patient-service.log';
export const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE === 'true' || false;
