import * as dotenv from 'dotenv';
dotenv.config();

export const GHL_API_URL = process.env.GHL_API_URL;
export const CLIENT_ID = process.env.CLIENT_ID || "";
export const GHL_API_VERSION = process.env.GHL_API_VERSION || "2021-07-28";

