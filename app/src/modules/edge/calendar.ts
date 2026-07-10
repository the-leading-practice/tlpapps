/**
 * EDGE-04 — Titanium Edge calendar/booking wrapper (EMOD-02).
 *
 * Thin, extraction-ready create/update/cancel over the EDGE-02 edgeFetch
 * transport. Reuses the shared EdgeCtx established in EDGE-03. Dark/additive
 * (EMOD-04): this module imports ONLY from ./client.js, ./types.js,
 * ../../logger.js — nothing from modules/sync/.
 *
 * Edge's Postgres `tstzrange EXCLUDE` anti-double-book conflict is
 * Edge-native (D-02) — this wrapper never precomputes availability or dedups
 * bookings client-side; a colliding booking's conflict response (e.g. 409)
 * is surfaced verbatim in { status, data }.
 *
 * Cancel semantics: this wrapper issues DELETE /api/bookings/{id} (vs a
 * status-change PATCH) — Claude's-discretion choice, documented here.
 *
 * NOTE: runtime-verify exact booking route names + cancel semantics against
 * the DW Edge tenant /openapi.json — confirmation deferred to the DW test
 * batch; this mapping layer is kept thin and adjustable.
 */
import { edgeFetch } from './client.js';
import { toFetchCtx, type EdgeCtx, type EdgeDeps } from './types.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'edge-calendar' });

export interface EdgeBookingInput {
  start: string; // ISO 8601
  end: string; // ISO 8601
  contactId: string; // patient -> Edge contact ref
  appointmentType?: string;
  // notes intentionally excluded per HIPAA boundary — do not thread free-text clinical notes.
}

interface EdgeBookingBody {
  start: string;
  end: string;
  calendar_id?: string;
  contact_id: string;
  appointment_type?: string;
}

/** Maps EdgeBookingInput -> Edge wire body; provider resolves from ctx.calendarId. */
function toEdgeBooking(input: EdgeBookingInput, ctx: EdgeCtx): EdgeBookingBody {
  return {
    start: input.start,
    end: input.end,
    ...(ctx.calendarId ? { calendar_id: ctx.calendarId } : {}),
    contact_id: input.contactId,
    ...(input.appointmentType ? { appointment_type: input.appointmentType } : {}),
  };
}

function fetchOpts(method: string, body: unknown, deps: EdgeDeps): RequestInit & { fetchImpl?: typeof fetch } {
  return {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
}

export async function createBooking(
  ctx: EdgeCtx,
  input: EdgeBookingInput,
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  const mapped = toEdgeBooking(input, ctx);
  log.info({ edgeBusinessId: ctx.edgeBusinessId }, 'edge: createBooking');
  return edgeFetch('/api/bookings', fetchOpts('POST', mapped, deps), toFetchCtx(ctx));
}

/** Maps a partial update input -> Edge wire body, including only provided fields. */
function toEdgeBookingPatch(input: Partial<EdgeBookingInput>, ctx: EdgeCtx): Partial<EdgeBookingBody> {
  return {
    ...(input.start ? { start: input.start } : {}),
    ...(input.end ? { end: input.end } : {}),
    ...(ctx.calendarId ? { calendar_id: ctx.calendarId } : {}),
    ...(input.contactId ? { contact_id: input.contactId } : {}),
    ...(input.appointmentType ? { appointment_type: input.appointmentType } : {}),
  };
}

export async function updateBooking(
  ctx: EdgeCtx,
  id: string,
  input: Partial<EdgeBookingInput>,
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  const mapped = toEdgeBookingPatch(input, ctx);
  log.info({ edgeBusinessId: ctx.edgeBusinessId, id }, 'edge: updateBooking');
  return edgeFetch(`/api/bookings/${encodeURIComponent(id)}`, fetchOpts('PUT', mapped, deps), toFetchCtx(ctx));
}

export async function cancelBooking(
  ctx: EdgeCtx,
  id: string,
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  log.info({ edgeBusinessId: ctx.edgeBusinessId, id }, 'edge: cancelBooking');
  return edgeFetch(`/api/bookings/${encodeURIComponent(id)}`, fetchOpts('DELETE', undefined, deps), toFetchCtx(ctx));
}
