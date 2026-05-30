/**
 * P09 T03 — DrChrono writer. create/update/cancel/delete for patients + appointments.
 *
 * ⚠️ DORMANT CODE. Invoked by the engine ONLY when `SYNC_WRITE_GHL_TO_DRCHRONO=on`
 * (user-gated in T06). Until then nothing here calls a live DrChrono endpoint. Tests
 * use mocks exclusively.
 *
 * All outbound calls route through `utils/fetch.ts`. Every mutating call carries an
 * `Idempotency-Key` header and an origin tag (`tlp-sync:drchrono:<eventId>`) — DrChrono
 * has no GHL-style custom field, so the tag is stamped into the appointment/patient
 * `notes` field (AUDIT §16) where the echo loop-guard reads it back. Retry + dead-letter
 * via shared.withRetry.
 */

import { config } from '../../../config.js';
import { fetchJson } from '../../../utils/fetch.js';
import { tagFor } from '../origin.js';
import {
  withRetry,
  idempotencyKey,
  type AttemptResult,
  type RetryOptions,
} from './shared.js';
import { logger } from '../../../logger.js';

const log = logger.child({ module: 'writer-drchrono' });

const DRCHRONO_API = config.drchrono.apiUrl;

export type DcVerb = 'create' | 'update' | 'cancel' | 'delete';
export type DcEntity = 'patient' | 'appointment';

export interface DcWriteInput {
  eventId: string;
  entity: DcEntity;
  verb: DcVerb;
  token: string;
  id?: string;
  body?: Record<string, unknown>;
}

export type HttpFn = (url: string, options: RequestInit) => Promise<AttemptResult>;

const defaultHttp: HttpFn = async (url, options) => {
  const { status, data } = await fetchJson(url, options);
  return { status, data };
};

function headers(token: string, idemKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': idemKey,
  };
}

/** Stamp the origin tag into the DrChrono `notes` field for echo loop prevention. */
function withOrigin(body: Record<string, unknown>, eventId: string): Record<string, unknown> {
  const tag = tagFor('drchrono', eventId);
  const existingNotes = typeof body.notes === 'string' ? body.notes : '';
  const notes = existingNotes ? `${existingNotes}\n${tag}` : tag;
  return { ...body, notes };
}

interface Route {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

/** Resolve the DrChrono endpoint + method for an (entity, verb). Pure. */
export function routeFor(input: DcWriteInput): Route {
  const { entity, verb, id } = input;
  const coll = entity === 'patient' ? 'patients' : 'appointments';
  const base = `${DRCHRONO_API}/api/${coll}`;
  if (verb === 'create') return { method: 'POST', url: `${base}`, body: input.body };
  if (verb === 'update') return { method: 'PATCH', url: `${base}/${id}`, body: input.body };
  if (verb === 'cancel')
    // DrChrono cancels an appointment by setting status; patients have no cancel.
    return {
      method: 'PATCH',
      url: `${base}/${id}`,
      body: { ...(input.body ?? {}), status: 'Cancelled' },
    };
  // delete
  return { method: 'DELETE', url: `${base}/${id}` };
}

/**
 * Perform a DrChrono write. Returns AttemptResult on success; throws WriteError (after
 * dead-lettering) on exhausted retries. `http` injectable for tests.
 */
export async function drchronoWrite(
  input: DcWriteInput,
  http: HttpFn = defaultHttp,
  retryOpts: RetryOptions = {},
): Promise<AttemptResult> {
  const route = routeFor(input);
  const idemKey = idempotencyKey(input.eventId, `drchrono:${input.entity}:${input.verb}`);
  const bodyObj = route.body ? withOrigin(route.body, input.eventId) : undefined;

  const options: RequestInit = {
    method: route.method,
    headers: headers(input.token, idemKey),
    ...(bodyObj ? { body: JSON.stringify(bodyObj) } : {}),
  };

  log.info(
    { op: `drchrono:${input.entity}:${input.verb}`, url: route.url, idemKey },
    'drchrono write attempt',
  );

  return withRetry(
    { eventId: input.eventId, op: `drchrono:${input.entity}:${input.verb}`, payload: bodyObj },
    () => http(route.url, options),
    retryOpts,
  );
}
