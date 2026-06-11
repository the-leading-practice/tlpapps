export type DrChronoConfig = {
  /** OAuth app credentials -- shared across all locations (your MyDC2 app) */
  clientId: string;
  clientSecret: string;
  /** Secret token set in the DrChrono webhook configuration */
  webhookSecret: string;
  config: {
    /** How often to run the periodic full-sync poll (ms) */
    RepeatMilliseconds: number;
    /** How many days ahead to fetch appointments during poll */
    LookAheadDays: number;
  };
  locations: DrChronoConfigLocation[];
};

export type DrChronoConfigLocation = {
  /** Descriptive name for the clinic */
  name: string;
  /**
   * DrChrono doctor ID for this location.
   * Used to route incoming webhook events to the correct location.
   */
  doctorId: number;
  /** Stored access token (auto-refreshed) */
  accessToken: string;
  /** Stored refresh token */
  refreshToken: string;
  /** Unix timestamp (ms) when the access token expires */
  tokenExpiry: number;
  /** TLP location ID used in patient service headers */
  tlpLocation: string;
  /** TLP auth token for patient service */
  tlpToken: string;
  /** GHL JWT for patient service to use when syncing to GHL */
  tlpJwt: string;
  /** GHL calendar ID for appointment sync */
  tlpCalendarId: string;
  /**
   * GHL location ID (e.g. "wP3Ynm3Z63rIC4zVAgXP").  Used to check the write
   * allowlist in the correct ID namespace.  If absent the legacy path fails
   * closed — no write is issued.
   */
  ghlLocationId?: string;
  /** IANA timezone string e.g. "America/New_York" */
  timezone: string;
};

export type DrChronoTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

export type DrChronoPatient = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  home_phone: string;
  cell_phone: string;
  office_phone: string;
  address: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  date_of_birth: string;
};

export type DrChronoAppointment = {
  id: number;
  patient: number;
  doctor: number;
  office: number;
  scheduled_time: string;
  duration: number;
  status: string;
  exam_room: number;
  notes: string;
};

export type DrChronoListResponse<T> = {
  results: T[];
  next: string | null;
  previous: string | null;
};

/** Webhook payload shape from DrChrono */
export type DrChronoWebhookPayload = {
  action: string;
  object: DrChronoAppointment | DrChronoPatient | Record<string, unknown>;
  doctor: number;
  secret_token: string;
};

export type TLPPatientPayload = {
  patientId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  work: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  dob: string;
  timezone: string;
};

export type TLPAppointmentPayload = {
  apptId: number;
  patientId: number;
  apptTime: string;
  apptStatus: string;
};

export type LocationHeaders = {
  tlpLocation: string;
  tlpToken: string;
  tlpJwt: string;
  tlpCalendarId: string;
  /**
   * GHL location ID in the correct namespace for the write allowlist check.
   * If absent the legacy drchrono write path fails closed (no write issued).
   */
  ghlLocationId?: string;
  timezone: string;
};
