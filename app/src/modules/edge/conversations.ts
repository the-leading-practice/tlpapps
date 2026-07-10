/**
 * EDGE-05 — Titanium Edge conversations wrapper (EMOD-03).
 *
 * SEAM for future message sync (deferred) — a minimal list/get/post surface
 * only, not full omnichannel/routing/auto-reply logic. Reuses the shared
 * EdgeCtx established in EDGE-03. Dark/additive (EMOD-04): this module
 * imports ONLY from ./client.js, ./types.js, ../../logger.js.
 *
 * NOTE: runtime-verify conversation route names/payload against the DW Edge
 * tenant /openapi.json — confirmation deferred to the DW test batch; this
 * mapping layer is kept thin and adjustable.
 */
import { edgeFetch } from './client.js';
import { toFetchCtx, type EdgeCtx, type EdgeDeps } from './types.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'edge-conversations' });

export interface EdgeConversationListParams {
  contactId?: string;
  limit?: number;
}

function fetchOpts(method: string, body: unknown, deps: EdgeDeps): RequestInit & { fetchImpl?: typeof fetch } {
  return {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
}

function buildQuery(params: EdgeConversationListParams = {}): string {
  const q = new URLSearchParams();
  if (params.contactId) q.set('contactId', params.contactId);
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

export async function listConversations(
  ctx: EdgeCtx,
  params: EdgeConversationListParams = {},
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  log.info({ edgeBusinessId: ctx.edgeBusinessId }, 'edge: listConversations');
  return edgeFetch(`/api/conversations${buildQuery(params)}`, fetchOpts('GET', undefined, deps), toFetchCtx(ctx));
}

export async function getConversation(
  ctx: EdgeCtx,
  id: string,
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  log.info({ edgeBusinessId: ctx.edgeBusinessId, id }, 'edge: getConversation');
  return edgeFetch(`/api/conversations/${encodeURIComponent(id)}`, fetchOpts('GET', undefined, deps), toFetchCtx(ctx));
}

export async function postMessage(
  ctx: EdgeCtx,
  id: string,
  body: { text: string; contactId?: string },
  deps: EdgeDeps = {},
): Promise<{ status: number; data: unknown }> {
  log.info({ edgeBusinessId: ctx.edgeBusinessId, id }, 'edge: postMessage');
  return edgeFetch(
    `/api/conversations/${encodeURIComponent(id)}/messages`,
    fetchOpts('POST', body, deps),
    toFetchCtx(ctx),
  );
}
