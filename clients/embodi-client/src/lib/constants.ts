import dotenv from 'dotenv'

const environment = process.env.NODE_ENV ? `.${process.env.NODE_ENV}` : '';
dotenv.config({ path: `.env${environment}` })

console.log( `running in ${environment}` );

export const API_KEY = process.env.API_KEY
export const SILK_ONE_API = process.env.SILK_ONE_API || '';
export const SILK_ONE_ID = process.env.SILK_ONE_ID || '';
export const SILK_ONE_SECRET = process.env.SILK_ONE_SECRET || '';

const MONGO_USER = process.env.MONGO_USER || '';
const MONGO_PASS = process.env.MONGO_PASS || '';
export const MONGO_DB = process.env.MONGO_DB || '';
export const MONGO_DB_CONN_STRING = process.env.MONGO_CONN_STRING ? `${process.env.MONGO_CONN_STRING.replace( /%USER%/g, MONGO_USER ).replace( /%PW%/g, encodeURIComponent( MONGO_PASS ) )}/${MONGO_DB}` : "";

