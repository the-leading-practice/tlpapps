/**
 * P05 verify mode — capture-sink HTTP injector.
 *
 * In `verify` write mode the engine builds the REAL outbound write (correct route,
 * method, body with origin tag + Idempotency-Key) exactly as it would in `on` mode,
 * but instead of calling the live EHR it hands the writer THIS http fn. The fn never
 * touches drchrono.com or the GHL API — its ONLY outbound HTTP is a POST of a capture
 * envelope to the verification sink, so a human can confirm the engine emits correct
 * create/update/cancel/delete payloads with zero risk to the live systems.
 *
 * The returned HttpFn returns a synthetic 200 so the writer's retry logic sees success
 * and the engine proceeds normally (mapping/link bookkeeping runs as it would live).
 */

import { fetchJson } from '../../../utils/fetch.js';
import type { AttemptResult } from './shared.js';

/** Writer-facing http signature (same shape as ghl.ts / drchrono.ts HttpFn). */
export type HttpFn = (url: string, options: RequestInit) => Promise<AttemptResult>;

export type VerifyDirection = 'ghl→drchrono' | 'drchrono→ghl';

export interface SinkEnvelope {
  capturedAt: string;
  direction: VerifyDirection;
  eventId: string;
  wouldHaveSent: {
    url: string;
    method?: string;
    headers: Record<string, string>;
    body: unknown;
  };
}

export interface MakeSinkHttpOpts {
  sinkUrl: string;
  direction: VerifyDirection;
  eventId: string;
  /** Injectable POST fn for tests; defaults to the real fetchJson. */
  http?: HttpFn;
}

/** Redact any Authorization/authorization header to a fixed placeholder. */
function redactHeaders(raw: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const entries: [string, string][] = Array.isArray(raw)
    ? (raw as [string, string][])
    : raw instanceof Headers
      ? Array.from(raw.entries())
      : Object.entries(raw as Record<string, string>);
  for (const [k, v] of entries) {
    out[k] = k.toLowerCase() === 'authorization' ? 'Bearer ***' : String(v);
  }
  return out;
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined;
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const defaultHttp: HttpFn = async (url, options) => {
  const { status, data } = await fetchJson(url, options);
  return { status, data };
};

/**
 * Build an HttpFn that, when handed the writer's fully-built (targetUrl, options),
 * POSTs a capture envelope to `sinkUrl` and returns a synthetic success. The target
 * EHR URL is NEVER fetched.
 */
export function makeSinkHttp(opts: MakeSinkHttpOpts): HttpFn {
  const post = opts.http ?? defaultHttp;
  return async (targetUrl, options) => {
    const envelope: SinkEnvelope = {
      capturedAt: new Date().toISOString(),
      direction: opts.direction,
      eventId: opts.eventId,
      wouldHaveSent: {
        url: targetUrl,
        method: options.method,
        headers: redactHeaders(options.headers),
        body: parseBody(options.body),
      },
    };

    await post(opts.sinkUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });

    // Synthetic success so the writer's retry/loop bookkeeping proceeds normally.
    return { status: 200, data: { captured: true } };
  };
}
