import dotenv from 'dotenv'

const environment = process.env.NODE_ENV ? `.${process.env.NODE_ENV}` : '';
dotenv.config({ path: `.env${environment}` })

console.log( `running in ${environment}` );

export const DRCHRONO_API = process.env.DRCHRONO_API || 'https://drchrono.com';
export const TLP_PATIENT_API = process.env.TLP_PATIENT_API || '';
export const PORT = process.env.PORT || '9101';
export const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || `http://localhost:9101/oauth/callback`;

const MONGO_USER = process.env.MONGO_USER || '';
const MONGO_PASS = process.env.MONGO_PASS || '';
export const MONGO_DB = process.env.MONGO_DB || '';
export const MONGO_DB_CONN_STRING = process.env.MONGO_CONN_STRING
  ? `${process.env.MONGO_CONN_STRING.replace( /%USER%/g, MONGO_USER ).replace( /%PW%/g, encodeURIComponent( MONGO_PASS ) )}/${MONGO_DB}`
  : '';
