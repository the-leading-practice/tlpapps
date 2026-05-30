/**
 * P08 mapper — pure payload normalization between GHL and DrChrono shapes and the
 * canonical PG row contracts (patients, appointment_links). No I/O, no EHR calls.
 *
 * TZ handling: appointment times are normalized to UTC ISO strings. The source
 * location's IANA zone is used to interpret naive (zoneless) local timestamps. We
 * use the built-in Intl/`Date` machinery (no Luxon dependency) — sufficient for the
 * dry-run intent computation in P08; P09's write layer formats per-EHR.
 */

import type { NewPatient } from '../../db/pg/schema/patients.js';

// --- Loose input shapes (EHR payloads are untyped jsonb in sync_events) --------

export interface GhlContact {
  id?: string;
  contactId?: string;
  locationId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  [k: string]: unknown;
}

export interface DrchronoPatient {
  id?: number | string;
  doctor?: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  cell_phone?: string;
  home_phone?: string;
  [k: string]: unknown;
}

export interface GhlAppointment {
  id?: string;
  calendarId?: string;
  locationId?: string;
  contactId?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
  [k: string]: unknown;
}

export interface DrchronoAppointment {
  id?: number | string;
  doctor?: number | string;
  patient?: number | string;
  scheduled_time?: string;
  duration?: number;
  status?: string;
  [k: string]: unknown;
}

// --- Normalized appointment shape (drives appointment_links intent) ------------

export interface NormalizedAppointment {
  ghlEventId: string | null;
  drchronoAppointmentId: string | null;
  locationId: string | null;
  doctorId: string | null;
  patientExternalId: string | null;
  calendarId: string | null;
  status: string | null;
  startUtc: string | null;
  endUtc: string | null;
}

// --- Patient mappers -----------------------------------------------------------

export function ghlContactToPatientPayload(ghl: GhlContact): NewPatient {
  return {
    locationId: str(ghl.locationId) ?? '',
    // GHL has no numeric patientId; engine resolves via mapping. 0 = unresolved sentinel.
    patientId: 0,
    contactId: str(ghl.id ?? ghl.contactId) ?? null,
  };
}

export function drchronoPatientToPatientPayload(
  dc: DrchronoPatient,
  locationId: string,
): NewPatient {
  return {
    locationId,
    patientId: toInt(dc.id) ?? 0,
    contactId: null,
  };
}

// --- Appointment mappers -------------------------------------------------------

export function ghlAppointmentToNormalized(
  ghl: GhlAppointment,
  zone: string,
): NormalizedAppointment {
  return {
    ghlEventId: str(ghl.id) ?? null,
    drchronoAppointmentId: null,
    locationId: str(ghl.locationId) ?? null,
    doctorId: null,
    patientExternalId: str(ghl.contactId) ?? null,
    calendarId: str(ghl.calendarId) ?? null,
    status: str(ghl.appointmentStatus) ?? null,
    startUtc: toUtcIso(ghl.startTime, zone),
    endUtc: toUtcIso(ghl.endTime, zone),
  };
}

export function drchronoAppointmentToNormalized(
  dc: DrchronoAppointment,
  zone: string,
): NormalizedAppointment {
  const start = toUtcIso(dc.scheduled_time, zone);
  const end =
    start && typeof dc.duration === 'number'
      ? new Date(new Date(start).getTime() + dc.duration * 60_000).toISOString()
      : null;
  return {
    ghlEventId: null,
    drchronoAppointmentId: str(dc.id) ?? null,
    locationId: null,
    doctorId: str(dc.doctor) ?? null,
    patientExternalId: str(dc.patient) ?? null,
    calendarId: null,
    status: str(dc.status) ?? null,
    startUtc: start,
    endUtc: end,
  };
}

// --- Hashing (stable content hash for change detection / sync_mappings.lastHash)-

export function hashAppointment(n: NormalizedAppointment): string {
  const canonical = JSON.stringify({
    s: n.startUtc,
    e: n.endUtc,
    st: n.status,
    cal: n.calendarId,
    doc: n.doctorId,
    pat: n.patientExternalId,
  });
  return djb2(canonical);
}

// --- Helpers -------------------------------------------------------------------

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
  return null;
}

/**
 * Normalize a timestamp to a UTC ISO string. If the input already carries an offset
 * or Z, it parses directly. Naive local timestamps are interpreted in `zone` (IANA).
 */
export function toUtcIso(input: unknown, zone: string): string | null {
  if (typeof input !== 'string' || input.trim() === '') return null;
  const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(input.trim());
  if (hasOffset) {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return naiveLocalToUtc(input, zone);
}

/**
 * Interpret a zoneless `YYYY-MM-DDTHH:mm[:ss]` as wall-clock time in `zone` and
 * return the equivalent UTC ISO. Uses Intl to find the zone's offset at that instant
 * (DST-correct via a single fixed-point step). No external TZ library.
 */
function naiveLocalToUtc(input: string, zone: string): string | null {
  const m = input
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, y, mo, da, h, mi, s] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +da, +h, +mi, s ? +s : 0);
  // offset = (time shown in zone) - (UTC) at this instant.
  const offsetMs = zoneOffsetMs(new Date(asUtc), zone);
  return new Date(asUtc - offsetMs).toISOString();
}

function zoneOffsetMs(date: Date, zone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtcOfLocal = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    return asUtcOfLocal - date.getTime();
  } catch {
    return 0; // unknown zone → treat as UTC
  }
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}
