/**
 * EDGE-06 Plan 02 — patient/appointment mapping to Edge shapes (D-05).
 *
 * HIPAA boundary: mapPatientToEdgeContact enumerates an ALLOWLIST of permitted output
 * fields and NEVER spreads the raw patient record — clinical fields (notes, diagnosis,
 * chart, medical history, etc.) can never leak through, even if a future EHR payload
 * adds new clinical keys upstream.
 *
 * ESYNC-04: GHL-only concepts (opportunities/pipelines, custom fields) have no Edge
 * analog for contacts/bookings. Where a sensible Edge field exists (lifecycle_stage,
 * tags) the concept is remapped; otherwise it is explicitly DROPPED. Every remap/drop
 * decision is pino-logged for audit (Repudiation mitigation, T-EDGE06-05).
 */

import { logger } from '../../../logger.js';
import { suppressTag } from '../suppression.js';
import type { EdgeContactInput } from '../../edge/types.js';
import type { EdgeBookingInput } from '../../edge/calendar.js';

const log = logger.child({ module: 'edge-map' });

/** Minimal patient shape this mapper reads from — allowlisted fields only. */
export interface PatientLike {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  /** GHL-only concept — no Edge analog for a raw pipeline/opportunity stage. Dropped
   *  unless a lifecycleStage is explicitly provided (see opts.lifecycleStage). */
  opportunityStage?: string;
  /** GHL-only concept — custom fields have no Edge target; always dropped, logged. */
  customFields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MapPatientOpts {
  /** Edge lifecycle stage to set, if the caller has already resolved a mapping
   *  for a GHL opportunity/pipeline stage (ESYNC-04 remap path). */
  lifecycleStage?: string;
  /** Extra tags to merge in (e.g. Edge origin tag) — merged with the suppression tag. */
  extraTags?: string[];
  source?: string;
}

/**
 * EHR patient -> Edge contact. Allowlist-only: name/email/phone/tags(+lifecycleStage/
 * source). Zero clinical fields ever cross this boundary. Always injects the
 * suppression-tag analog (mirrors GHL 'Existing Patient') into tags.
 */
export function mapPatientToEdgeContact(
  patient: PatientLike,
  opts: MapPatientOpts = {},
): EdgeContactInput {
  // ESYNC-04 gap mapping: log every GHL-only concept we see and how it was handled.
  if (patient.opportunityStage !== undefined) {
    if (opts.lifecycleStage) {
      log.info(
        { concept: 'opportunityStage', decision: 'remapped', to: 'lifecycleStage' },
        'ESYNC-04: GHL opportunity/pipeline stage remapped to Edge lifecycle_stage',
      );
    } else {
      log.info(
        { concept: 'opportunityStage', decision: 'dropped' },
        'ESYNC-04: GHL opportunity/pipeline stage has no Edge analog — dropped',
      );
    }
  }
  if (patient.customFields !== undefined && Object.keys(patient.customFields).length > 0) {
    log.info(
      { concept: 'customFields', decision: 'dropped', keys: Object.keys(patient.customFields) },
      'ESYNC-04: GHL custom fields have no Edge target — dropped',
    );
  }

  const tags = Array.from(
    new Set([...(patient.tags ?? []), suppressTag(), ...(opts.extraTags ?? [])]),
  );

  const contact: EdgeContactInput = {
    ...(patient.firstName ? { firstName: patient.firstName } : {}),
    ...(patient.lastName ? { lastName: patient.lastName } : {}),
    ...(patient.email ? { email: patient.email } : {}),
    ...(patient.phone ? { phone: patient.phone } : {}),
    tags,
    ...(opts.lifecycleStage ? { lifecycleStage: opts.lifecycleStage } : {}),
    ...(opts.source ? { source: opts.source } : {}),
  };

  return contact;
}

/** Minimal appointment shape this mapper reads from. */
export interface AppointmentLike {
  start: string;
  end: string;
  /** Resolved Edge contact id for the patient — caller resolves via patient mapping /
   *  sync_mappings before calling this mapper. */
  contactId: string;
  appointmentType?: string;
  /** GHL/DrChrono free-text notes — intentionally NEVER threaded to Edge (HIPAA). */
  notes?: string;
  [key: string]: unknown;
}

/**
 * EHR appointment -> Edge booking. start/end/contactId(+appointmentType) only.
 * `notes` is never read from the input — Edge bookings carry no free-text clinical
 * content (D-05, EdgeBookingInput itself has no notes field).
 */
export function mapAppointmentToEdgeBooking(appt: AppointmentLike): EdgeBookingInput {
  if (appt.notes !== undefined) {
    log.info(
      { concept: 'notes', decision: 'dropped' },
      'ESYNC-04/HIPAA: appointment notes never threaded to Edge booking',
    );
  }
  return {
    start: appt.start,
    end: appt.end,
    contactId: appt.contactId,
    ...(appt.appointmentType ? { appointmentType: appt.appointmentType } : {}),
  };
}
