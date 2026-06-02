/**
 * P09 T03 — GHL writer. create/update/cancel/delete for contacts + appointments.
 *
 * ⚠️ DORMANT CODE. Invoked by the engine ONLY when `SYNC_WRITE_DRCHRONO_TO_GHL=on`
 * (user-gated in T06). Until then nothing here calls a live GHL endpoint. Tests use
 * mocks exclusively.
 *
 * All outbound calls funnel through `utils/fetch.ts` (AUDIT §16 choke point) — never a
 * raw fetch. Every mutating call carries:
 *   - `Idempotency-Key` header (safe retries; GHL dedupes server-side where supported)
 *   - an origin tag (`tlp-sync:ghl:<eventId>`) stamped into the payload so the resulting
 *     webhook echo is recognized as self-authored and skipped (loop prevention).
 * Retry + dead-letter handled by shared.withRetry.
 */

import { config } from '../../../config.js';
import { fetchJson } from '../../../utils/fetch.js';
import { tagFor } from '../origin.js';
import { applyContactSuppression } from '../suppression.js';
import {
  withRetry,
  idempotencyKey,
  type AttemptResult,
  type RetryOptions,
} from './shared.js';
import { logger } from '../../../logger.js';

const log = logger.child({ module: 'writer-ghl' });

const GHL_API_URL = config.ghl.apiUrl;
const GHL_API_VERSION = config.ghl.apiVersion;

export type GhlVerb = 'create' | 'update' | 'cancel' | 'delete';
export type GhlEntity = 'contact' | 'appointment';

export interface GhlWriteInput {
  eventId: string;
  entity: GhlEntity;
  verb: GhlVerb;
  token: string;
  /** Target id for update/cancel/delete. */
  id?: string;
  /** Body for create/update. Origin tag is injected automatically. */
  body?: Record<string, unknown>;
}

/** Injectable HTTP fn so tests can substitute a mock without network. */
export type HttpFn = (url: string, options: RequestInit) => Promise<AttemptResult>;

const defaultHttp: HttpFn = async (url, options) => {
  const { status, data } = await fetchJson(url, options);
  return { status, data };
};

function headers(token: string, idemKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    version: GHL_API_VERSION,
    'Content-Type': 'application/json',
    'Idempotency-Key': idemKey,
  };
}

/** Stamp the loop-prevention origin tag into a custom field carrier on the payload. */
function withOrigin(body: Record<string, unknown>, eventId: string): Record<string, unknown> {
  return { ...body, origin_tag: tagFor('ghl', eventId) };
}

interface Route {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

/** Resolve the GHL endpoint + method for an (entity, verb). Pure — unit-testable. */
export function routeFor(input: GhlWriteInput): Route {
  const { entity, verb, id } = input;
  const base = GHL_API_URL;
  if (entity === 'contact') {
    if (verb === 'create') return { method: 'POST', url: `${base}/contacts/upsert`, body: input.body };
    if (verb === 'update') return { method: 'PUT', url: `${base}/contacts/${id}`, body: input.body };
    // cancel/delete a contact => delete
    return { method: 'DELETE', url: `${base}/contacts/${id}` };
  }
  // appointment
  if (verb === 'create')
    return { method: 'POST', url: `${base}/calendars/events/appointments/`, body: input.body };
  if (verb === 'update' || verb === 'cancel')
    // cancel => update appointmentStatus to 'cancelled'
    return {
      method: 'PUT',
      url: `${base}/calendars/events/appointments/${id}`,
      body:
        verb === 'cancel'
          ? { ...(input.body ?? {}), appointmentStatus: 'cancelled' }
          : input.body,
    };
  // delete
  return { method: 'DELETE', url: `${base}/calendars/events/${id}` };
}

/**
 * Perform a GHL write. Returns the final AttemptResult on success; throws WriteError
 * (after dead-lettering) on exhausted retries. `http` is injectable for tests.
 */
export async function ghlWrite(
  input: GhlWriteInput,
  http: HttpFn = defaultHttp,
  retryOpts: RetryOptions = {},
): Promise<AttemptResult> {
  const route = routeFor(input);
  const idemKey = idempotencyKey(input.eventId, `ghl:${input.entity}:${input.verb}`);
  // SAFETY: CONTACT bodies carry the automation-suppression tag (+ DND backstop) so synced
  // patients never trigger GHL workflows. Appointments are NOT contacts — left untouched.
  // TODO(on-mode token wiring): pass resolveSuppressTag(GET /locations/{id}/tags) result here
  // as the 2nd arg so the location's EXACT stored spelling is used (else GHL mints a new tag).
  const guarded =
    route.body && input.entity === 'contact' ? applyContactSuppression(route.body) : route.body;
  const bodyObj = guarded ? withOrigin(guarded, input.eventId) : undefined;

  const options: RequestInit = {
    method: route.method,
    headers: headers(input.token, idemKey),
    ...(bodyObj ? { body: JSON.stringify(bodyObj) } : {}),
  };

  log.info(
    { op: `ghl:${input.entity}:${input.verb}`, url: route.url, idemKey },
    'ghl write attempt',
  );

  return withRetry(
    { eventId: input.eventId, op: `ghl:${input.entity}:${input.verb}`, payload: bodyObj },
    () => http(route.url, options),
    retryOpts,
  );
}
