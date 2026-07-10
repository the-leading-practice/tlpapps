/**
 * EDGE-03 — Titanium Edge contacts wrapper (EMOD-01).
 *
 * Thin, extraction-ready create/update/get over the EDGE-02 edgeFetch
 * transport. Dark/additive: nothing in existing sync/EHR/GHL/webhook paths
 * calls this yet (EMOD-04) — this module imports ONLY from ./client.js,
 * ./types.js, ../../logger.js.
 *
 * NOTE: runtime-verify routes/payload against the DW Edge tenant
 * /openapi.json — confirmation deferred to the DW test batch; this mapping
 * layer is kept thin and adjustable.
 */
import { edgeFetch } from './client.js';
import { toFetchCtx, type EdgeCtx, type EdgeContactInput, type EdgeContactRecord, type EdgeDeps } from './types.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'edge-contacts' });

interface EdgeContactBody {
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  lifecycle_stage?: string;
  contact_type?: string;
  source?: string;
}

/** Maps EdgeContactInput -> Edge wire body. No pipeline/custom-field concepts. */
function toEdgeContact(input: EdgeContactInput): EdgeContactBody {
  const name = input.name || [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || undefined;
  const body: EdgeContactBody = {
    ...(name ? { name } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.lifecycleStage ? { lifecycle_stage: input.lifecycleStage } : {}),
    ...(input.contactType ? { contact_type: input.contactType } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
  return body;
}

function fetchOpts(method: string, body: unknown, deps: EdgeDeps): RequestInit & { fetchImpl?: typeof fetch } {
  return {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
}

export async function createContact(
  ctx: EdgeCtx,
  input: EdgeContactInput,
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  const mapped = toEdgeContact(input);
  log.info({ edgeBusinessId: ctx.edgeBusinessId }, 'edge: createContact');
  return edgeFetch('/api/contacts', fetchOpts('POST', mapped, deps), toFetchCtx(ctx));
}

export async function updateContact(
  ctx: EdgeCtx,
  id: string,
  input: EdgeContactInput,
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  const mapped = toEdgeContact(input);
  log.info({ edgeBusinessId: ctx.edgeBusinessId, id }, 'edge: updateContact');
  return edgeFetch(`/api/contacts/${encodeURIComponent(id)}`, fetchOpts('PUT', mapped, deps), toFetchCtx(ctx));
}

export async function getContact(
  ctx: EdgeCtx,
  id: string,
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  log.info({ edgeBusinessId: ctx.edgeBusinessId, id }, 'edge: getContact');
  return edgeFetch(`/api/contacts/${encodeURIComponent(id)}`, fetchOpts('GET', undefined, deps), toFetchCtx(ctx));
}

export type { EdgeContactRecord };
