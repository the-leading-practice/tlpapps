/**
 * P08 origin-tagging — prevents sync loops. When the engine (P09) writes a record
 * into GHL or DrChrono, it stamps an origin tag so the resulting webhook echo can be
 * recognized as self-authored and skipped (decision.ts → action 'skip-loop').
 *
 * Tag shape: `tlp-sync:<system>:<eventId>` where <system> is the system the engine
 * wrote INTO ('ghl' | 'drchrono') and <eventId> is the originating sync_events.id.
 * On GHL this lands in a custom field; on DrChrono in the appointment/patient notes
 * (per P01 AUDIT §16 touchpoints — the concrete field wiring is P09's write layer).
 *
 * Pure functions only — no I/O. Behavior-neutral in P08 (dry-run): the engine
 * computes the tag it WOULD write and records intent; nothing is sent to an EHR.
 */

export type SyncSystem = 'ghl' | 'drchrono';

export const ORIGIN_PREFIX = 'tlp-sync';

export interface OriginTag {
  system: SyncSystem;
  eventId: string;
}

/** Build the canonical origin tag string for a write the engine performs. */
export function tagFor(system: SyncSystem, eventId: string): string {
  return `${ORIGIN_PREFIX}:${system}:${eventId}`;
}

/**
 * Parse an origin tag out of a free-form payload value (string, or an object whose
 * notes/customField/origin_tag fields may carry it). Returns null when no tlp-sync
 * tag is present (i.e. a genuine human/EHR-authored change, not a sync echo).
 */
export function parse(payload: unknown): OriginTag | null {
  const haystack = collectStrings(payload);
  for (const s of haystack) {
    const m = s.match(/tlp-sync:(ghl|drchrono):([^\s"'}]+)/);
    if (m) {
      return { system: m[1] as SyncSystem, eventId: m[2] };
    }
  }
  return null;
}

/**
 * True when the payload carries a tlp-sync tag for the given system — i.e. this
 * change is an echo of a write WE made and must not be re-propagated (loop guard).
 */
export function isSelfAuthored(payload: unknown, system: SyncSystem): boolean {
  const tag = parse(payload);
  return tag !== null && tag.system === system;
}

/** Gather candidate strings from common origin-tag carrier fields. */
function collectStrings(payload: unknown): string[] {
  if (payload == null) return [];
  if (typeof payload === 'string') return [payload];
  if (typeof payload !== 'object') return [];

  const out: string[] = [];
  const obj = payload as Record<string, unknown>;
  for (const key of ['origin_tag', 'originTag', 'notes', 'note', 'customField', 'custom_field', 'tags']) {
    const v = obj[key];
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === 'string'));
  }
  return out;
}
