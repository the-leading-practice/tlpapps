/**
 * EDGE-06 Plan 02 — Edge destination writer. Mirrors `writers/ghl.ts`'s shape: verbs
 * create/update/cancel over entities contact/appointment, calling the EDGE-03/04
 * `modules/edge/contacts.ts` + `modules/edge/calendar.ts` wrappers (never raw routes),
 * wrapped in the shared `withRetry`/dead-letter envelope (ESYNC-03 parity with ghlWrite).
 *
 * Kept free of any kill-switch/env logic (separation for Phase 10 dual-destination) and
 * NEVER builds an EdgeCtx or decrypts a token itself — the ctx is passed IN by the
 * caller (dispatch.ts / Plan 03), which also owns the demo-guardrail decision.
 *
 * Cancel semantics for a contact: Edge contacts have no "cancelled" status and this
 * writer must never destructively delete an Edge contact record (a synced patient
 * record should persist even if the source appointment/relationship is cancelled).
 * `edgeWrite(cancel, contact)` is therefore a documented NO-OP — it returns a synthetic
 * success without any network call, mirroring the "safer branch" discretion the plan
 * calls out. Appointment cancel DOES call the real `cancelBooking` wrapper (Edge has an
 * explicit booking-cancel endpoint).
 */

import { createContact, updateContact } from '../../edge/contacts.js';
import { createBooking, updateBooking, cancelBooking, type EdgeBookingInput } from '../../edge/calendar.js';
import type { EdgeCtx, EdgeContactInput, EdgeDeps } from '../../edge/types.js';
import { mapPatientToEdgeContact, mapAppointmentToEdgeBooking, type PatientLike, type AppointmentLike } from './edge-map.js';
import { tagFor } from '../origin.js';
import { withRetry, idempotencyKey, type AttemptResult, type RetryOptions } from './shared.js';
import { logger } from '../../../logger.js';

const log = logger.child({ module: 'writer-edge' });

export type EdgeWriteVerb = 'create' | 'update' | 'cancel';
export type EdgeWriteEntity = 'contact' | 'appointment';

export interface EdgeWriteInput {
  eventId: string;
  entity: EdgeWriteEntity;
  verb: EdgeWriteVerb;
  ctx: EdgeCtx;
  /** Target Edge id for update/cancel. */
  id?: string;
  /** Raw EHR-shaped body — mapped via edge-map.ts inside this writer. */
  body?: PatientLike | AppointmentLike | Partial<AppointmentLike>;
}

/** Injectable wrapper fns so tests substitute mocks — NO network in unit tests. */
export interface EdgeWriteDeps {
  createContact?: typeof createContact;
  updateContact?: typeof updateContact;
  createBooking?: typeof createBooking;
  updateBooking?: typeof updateBooking;
  cancelBooking?: typeof cancelBooking;
  retryDelayFactor?: number;
  edgeDeps?: EdgeDeps;
}

async function callContact(
  input: EdgeWriteInput,
  mapped: EdgeContactInput,
  deps: EdgeWriteDeps,
): Promise<AttemptResult> {
  const create = deps.createContact ?? createContact;
  const update = deps.updateContact ?? updateContact;

  if (input.verb === 'create') {
    return create(input.ctx, mapped, deps.edgeDeps);
  }
  if (input.verb === 'update') {
    return update(input.ctx, input.id!, mapped, deps.edgeDeps);
  }
  // verb === 'cancel' — documented no-op (see file header): never destructively
  // delete/mutate an Edge contact on a cancel signal. No network call.
  log.info(
    { op: 'edge:contact:cancel', eventId: input.eventId },
    'edge contact cancel — no-op by design (contact records persist)',
  );
  return { status: 200, data: { noop: true } };
}

async function callAppointment(
  input: EdgeWriteInput,
  deps: EdgeWriteDeps,
): Promise<AttemptResult> {
  const create = deps.createBooking ?? createBooking;
  const update = deps.updateBooking ?? updateBooking;
  const cancel = deps.cancelBooking ?? cancelBooking;

  if (input.verb === 'create') {
    const mapped = mapAppointmentToEdgeBooking(input.body as AppointmentLike);
    return create(input.ctx, mapped, deps.edgeDeps);
  }
  if (input.verb === 'update') {
    const body = (input.body ?? {}) as Partial<AppointmentLike>;
    const partial: Partial<EdgeBookingInput> = {
      ...(typeof body.start === 'string' ? { start: body.start } : {}),
      ...(typeof body.end === 'string' ? { end: body.end } : {}),
      ...(typeof body.contactId === 'string' ? { contactId: body.contactId } : {}),
      ...(typeof body.appointmentType === 'string' ? { appointmentType: body.appointmentType } : {}),
    };
    return update(input.ctx, input.id!, partial, deps.edgeDeps);
  }
  // verb === 'cancel'
  return cancel(input.ctx, input.id!, deps.edgeDeps);
}

/**
 * Perform an Edge write. Returns the final AttemptResult on success; throws WriteError
 * (after dead-lettering) on exhausted retries — ESYNC-03 parity with ghlWrite/drchronoWrite.
 * `deps` wrapper fns are injectable for tests (no network).
 */
export async function edgeWrite(
  input: EdgeWriteInput,
  deps: EdgeWriteDeps = {},
): Promise<AttemptResult> {
  const op = `edge:${input.entity}:${input.verb}`;
  const idemKey = idempotencyKey(input.eventId, op);
  const retryOpts: RetryOptions = { delayFactor: deps.retryDelayFactor };

  log.info({ op, eventId: input.eventId, idemKey }, 'edge write attempt');

  if (input.entity === 'contact') {
    const originTag = tagFor('edge', input.eventId);
    const mapped = mapPatientToEdgeContact((input.body as PatientLike) ?? {}, {
      extraTags: [originTag],
    });
    return withRetry(
      { eventId: input.eventId, op, payload: mapped },
      () => callContact(input, mapped, deps),
      retryOpts,
    );
  }

  // entity === 'appointment' — no tags field on EdgeBookingInput; origin tracking for
  // bookings is out of scope for Phase 6 (basic contact-side tag only, per D-04/context).
  return withRetry(
    { eventId: input.eventId, op, payload: input.body },
    () => callAppointment(input, deps),
    retryOpts,
  );
}
