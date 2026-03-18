import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8080'),
  mongoConnString: buildMongoConnString(),
  tokenKey: process.env.TOKEN_KEY || '',
  ghl: {
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    apiUrl: process.env.GHL_API_URL || 'https://services.leadconnectorhq.com',
    apiVersion: process.env.GHL_API_VERSION || '2021-07-28',
    redirectUrl: process.env.REDIRECT_URL || 'https://tlpapps.theleadingpractice.com:8080/oauth',
  },
  drchrono: {
    apiUrl: process.env.DRCHRONO_API || 'https://drchrono.com',
    oauthRedirectUri: process.env.OAUTH_REDIRECT_URI || '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  clickup: {
    apiKey: process.env.CLICKUP_API_KEY || '',
    chatId: process.env.CLICKUP_CHAT_ID || '',
  },
  logPath: process.env.LOG_PATH || './logs',
} as const;

function buildMongoConnString(): string {
  const connStr = process.env.MONGO_CONN_STRING || '';
  const user = process.env.MONGO_USER || '';
  const pass = process.env.MONGO_PASS || '';
  const db = process.env.MONGO_DB || '';
  if (!connStr) return '';

  // If credentials are embedded in the URL already, use as-is with ?authSource and db
  // If using %USER%/%PW% placeholders, substitute them
  let base = connStr.replace(/%USER%/g, user).replace(/%PW%/g, encodeURIComponent(pass));

  // If the connection string already has a path (e.g. /admin), use authSource instead of appending db
  const url = new URL(base);
  const existingDb = url.pathname.replace('/', '');
  if (existingDb && db && existingDb !== db) {
    // Use the existing path as authSource, connect to the specified db
    url.pathname = `/${db}`;
    url.searchParams.set('authSource', existingDb);
    return url.toString();
  }

  if (db && !existingDb) {
    url.pathname = `/${db}`;
    return url.toString();
  }

  return base;
}
