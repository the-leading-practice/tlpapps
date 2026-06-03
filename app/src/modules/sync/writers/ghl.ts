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
import { resolveLocationSuppressTag, type TagFetch } from '../location-tags.js';
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
  /**
   * GHL location id. Required only to resolve the location's EXACT suppression-tag
   * spelling for `on`-mode CONTACT writes. When present (with a token) the writer fetches
   * the location's stored tags and uses the matched spelling; otherwise it falls back to
   * the configured env literal (dry/verify keep the env literal).
   */
  locationId?: string;
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

/**
 * Stamp the loop-prevention origin tag onto the outbound payload.
 *
 * GHL's contact/appointment upsert schemas reject unknown top-level properties (a stray
 * `origin_tag` 422s — "property origin_tag should not exist"). For CONTACTS the origin
 * marker therefore rides in the `tags` array: GHL accepts arbitrary tags and echoes them
 * back in the contact webhook, where `origin.parse()` (which now scans `tags`) recognizes
 * the self-authored echo and skips it. The marker is a unique `tlp-sync:ghl:<eventId>`
 * tag — inert to the owner's workflow filters, so it never triggers/suppresses automations.
 * Appointment loop-guard wiring is still pending (the calendar-event schema has no tags),
 * so appointment writes go unstamped rather than carry a property GHL rejects.
 */
function withOrigin(
  body: Record<string, unknown>,
  eventId: string,
  entity: GhlEntity,
): Record<string, unknown> {
  if (entity !== 'contact') return body;
  const originTag = tagFor('ghl', eventId);
  const existing = Array.isArray(body.tags) ? (body.tags as unknown[]) : [];
  return { ...body, tags: Array.from(new Set([...existing, originTag])) };
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
  tagFetch?: TagFetch,
): Promise<AttemptResult> {
  const route = routeFor(input);
  const idemKey = idempotencyKey(input.eventId, `ghl:${input.entity}:${input.verb}`);
  // SAFETY: CONTACT bodies carry the automation-suppression tag (+ DND backstop) so synced
  // patients never trigger GHL workflows. Appointments are NOT contacts — left untouched.
  //
  // ON-MODE TAG WIRING (was TODO): for a CONTACT write with a real token + locationId
  // (i.e. `on` mode), resolve the location's EXACT stored tag spelling via
  // GET /locations/{id}/tags and pass it into applyContactSuppression so GHL reuses the
  // canonical tag (no new tag minted, workflow filter still matches). resolveLocationSuppressTag
  // is DEGRADE-SAFE: on fetch failure / tag-absent it returns the configured literal, so a
  // contact is NEVER sent untagged and this never throws. dry/verify carry no token → keep
  // the env literal exactly as before.
  let resolvedTag: string | undefined;
  if (route.body && input.entity === 'contact' && input.token && input.locationId) {
    resolvedTag = await resolveLocationSuppressTag(input.locationId, input.token, tagFetch);
  }
  const guarded =
    route.body && input.entity === 'contact'
      ? applyContactSuppression(route.body, resolvedTag)
      : route.body;
  const bodyObj = guarded ? withOrigin(guarded, input.eventId, input.entity) : undefined;

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
