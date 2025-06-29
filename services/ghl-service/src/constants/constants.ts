import * as dotenv from 'dotenv';
dotenv.config();

export const GHL_API_URL = process.env.GHL_API_URL;
export const CLIENT_ID = process.env.CLIENT_ID || "";
export const GHL_API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";

// ghl custom field settings
export const GHL_CUSTOM_FIELD_ID = "SEyhHXZR8hzYYpy7qByu";
export const GHL_CUSTOM_FIELD_KEY = "contact.client_patient_id";

// logging
export const LOG_PATH = process.env.LOG_PATH || '/var/logs/ghl-service';
export const LOG_LEVEL: string | number = process.env.LOG_LEVEL || 40;
export const LOG_FILE_NAME = process.env.LOG_FILE_NAME || 'ghl-service.log';
export const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE === 'true' || false;
