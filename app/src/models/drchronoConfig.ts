import mongoose from 'mongoose';

const drChronoConfigSchema = new mongoose.Schema(
  {
    /** Your DrChrono OAuth app -- same client_id/secret for all locations */
    clientId: { type: String, required: true },
    clientSecret: { type: String, required: true },
    /** Must match the Secret Token set in the DrChrono webhook dashboard */
    webhookSecret: { type: String, required: true },
    config: {
      type: {
        RepeatMilliseconds: { type: Number, required: true },
        LookAheadDays: { type: Number, required: true },
      },
      required: true,
    },
    locations: [
      {
        name: { type: String, required: true },
        doctorId: { type: Number, required: true },
        accessToken: { type: String, required: true },
        refreshToken: { type: String, required: true },
        tokenExpiry: { type: Number, required: true },
        tlpLocation: { type: String, required: true },
        tlpToken: { type: String, required: true },
        tlpJwt: { type: String, required: true },
        tlpCalendarId: { type: String, required: true },
        timezone: { type: String, required: true },
        /** GHL location id this DrChrono location maps to — used for sync allowlist checks. */
        ghlLocationId: { type: String },
        /** DrChrono appointment-profile id → GHL calendarId routing map (BIDI-01). */
        profileCalendarMap: { type: Object, required: false },
      },
    ],
  },
  { collection: 'drChronoConfig' },
);

export const DrChronoConfigModel = mongoose.model('drChronoConfig', drChronoConfigSchema);
