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
  /** DrChrono profile id → GHL calendarId routing map (per BIDI-01). */
  profileCalendarMap?: Record<string, string>;
  /**
   * DrChrono office id → GHL calendarId routing map. Fallback used ONLY when an
   * appointment has no profile (null) — e.g. massage booked directly in DrChrono,
   * which carry no exam profile. Routes those to the correct calendar so the slot
   * is blocked in GHL (prevents double-booking). Office is always populated, so
   * this is deterministic; it never overrides an explicit profile mapping.
   */
  officeCalendarMap?: Record<string, string>;
  /**
   * DrChrono provider (doctor) id → GHL availability-block target. Drives the
   * DrChrono→GHL blocked-time (availability) sync: a break for a mapped provider
   * becomes a GHL block-slot assigned to that provider's `ghlUserId`. Empty/absent
   * → the whole location is a no-op (availability sync ships OFF pending this map).
   */
  providerAvailabilityMap?: Record<string, { ghlUserId: string; calendarIds: string[] }>;
  /**
   * Cached appointment profiles (last successful DrChrono fetch). Used as a
   * fallback by the calendar-map admin page when DrChrono is rate-limited.
   */
  appointmentProfiles?: CalendarMapProfile[];
  /** Unix ms timestamp of the last successful appointmentProfiles fetch. */
  appointmentProfilesFetchedAt?: number;
};

/** Minimal appointment-profile shape surfaced to the calendar-map admin UI. */
export type CalendarMapProfile = {
  id: number;
  name: string;
  duration: number | null;
  color: string | null;
};

/**
 * DrChrono Custom Appointment Profile. Each profile maps 1:1 to a GHL service
 * calendar during onboarding (BIDI-03). Fields kept minimal/optional — DrChrono
 * returns many more we don't consume.
 */
export type DrChronoAppointmentProfile = {
  id: number;
  name: string;
  /** Default appointment length in minutes. */
  duration?: number;
  /** Hex color (e.g. "#3B82F6") used to style the GHL calendar. */
  color?: string;
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
  /** true when this slot is a break / blocked time (no patient). */
  appt_is_break?: boolean;
  /** DrChrono Custom Appointment Profile id (maps to a GHL service/calendar). */
  profile?: number | null;
  /** Reason-for-visit text; used as the block/appointment title. */
  reason?: string;
  /** Profile color (hex) — carried for future GHL service styling. */
  color?: string;
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
  /** GHL location id, injected before the outbound /api/patient call. */
  locationId?: string;
};

export type TLPAppointmentPayload = {
  apptId: number;
  patientId: number;
  apptTime: string;
  apptStatus: string;
  /** GHL location id, injected before the outbound /api/appt call. */
  locationId?: string;
  /** GHL calendar id for the appointment write. */
  calendarId?: string;
  /** true → write as a GHL blocked-time slot, not a contact appointment. */
  isBreak?: boolean;
  /** Appointment duration in minutes (used to compute block end time). */
  durationMinutes?: number;
  /** Reason / profile name — used as the block title. */
  title?: string;
  /** DrChrono Custom Appointment Profile id (for per-service calendar routing). */
  profileId?: number | null;
  /** DrChrono office id (fallback calendar routing when profileId is null). */
  officeId?: number | null;
  /**
   * Loop-prevention origin tag stamped by the sync engine before any outbound write.
   * Carried through the legacy appointment pipeline so the final GHL call includes
   * it in the `notes` field — inbound webhook echo is then recognized as self-authored
   * and skipped (origin.isSelfAuthored check in decision.ts).
   */
  syncOriginTag?: string;
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
  /** DrChrono profile id → GHL calendarId routing map (per BIDI-01). */
  profileCalendarMap?: Record<string, string>;
  /** DrChrono office id → GHL calendarId fallback map (null-profile appts only). */
  officeCalendarMap?: Record<string, string>;
};
