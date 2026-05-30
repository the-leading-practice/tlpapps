/**
 * P08 decision engine — implements conflict policy D-01 (DrChrono is authoritative;
 * non-trivial conflicts queue for manual review) and D-02 (cancel/delete/reschedule
 * propagate bidirectionally).
 *
 * Pure decision logic: given an incoming event, the current sync_mapping, and the
 * known opposite-side state, return the INTENT only. The engine (engine.ts) executes
 * the intent against PG sync state. NO EHR API calls happen anywhere in P08 — even a
 * `write` action only persists mapping/link rows and logs the would-be EHR write.
 */

import { parse as parseOrigin } from './origin.js';
import type { SyncMapping } from '../../db/pg/schema/sync.js';

export type SyncSystem = 'ghl' | 'drchrono';

export type DecisionAction = 'write' | 'skip-loop' | 'queue-conflict' | 'no-op';

export interface DecisionInput {
  /** Which system the event came FROM. */
  source: SyncSystem;
  /** Normalized verb: created | updated | cancelled | deleted | rescheduled. */
  action: string;
  /** Incoming normalized payload (post-mapper). */
  incoming: Record<string, unknown>;
  /** Stable content hash of the incoming normalized payload. */
  incomingHash: string;
  /** Existing mapping row, if this entity has been seen before. */
  mapping?: SyncMapping | null;
  /** Last known content hash of the OPPOSITE side (for divergence detection). */
  oppositeHash?: string | null;
  /** Raw event payload (used for origin-tag loop detection). */
  rawPayload?: unknown;
}

export interface Decision {
  action: DecisionAction;
  /** System we WOULD write into (opposite of source), when action === 'write'. */
  target: SyncSystem | null;
  /** The payload we'd hand to the P09 write layer. */
  payload: Record<string, unknown> | null;
  reason: string;
}

const CANCEL_DELETE = new Set(['cancelled', 'canceled', 'deleted', 'cancel', 'delete']);
const RESCHEDULE = new Set(['rescheduled', 'reschedule', 'moved']);

export function decide(input: DecisionInput): Decision {
  const target: SyncSystem = input.source === 'ghl' ? 'drchrono' : 'ghl';
  const verb = input.action.toLowerCase();

  // 1. Loop guard: if the change is an echo of a write WE made into `source`, skip.
  const origin = parseOrigin(input.rawPayload);
  if (origin && origin.system === input.source) {
    return {
      action: 'skip-loop',
      target: null,
      payload: null,
      reason: `self-authored echo (origin event ${origin.eventId})`,
    };
  }

  // 2. Idempotency short-circuit: incoming hash already recorded on the mapping.
  if (input.mapping && input.mapping.lastHash === input.incomingHash) {
    return {
      action: 'no-op',
      target: null,
      payload: null,
      reason: 'incoming hash matches mapping.lastHash — already in sync',
    };
  }

  // 3. D-02: cancel / delete propagate both directions unconditionally.
  if (CANCEL_DELETE.has(verb)) {
    return {
      action: 'write',
      target,
      payload: { ...input.incoming, _verb: 'cancel' },
      reason: `D-02 cancel/delete propagates ${input.source} -> ${target}`,
    };
  }

  // 4. Conflict detection (D-01). Both sides diverged since last sync?
  const bothChanged =
    input.mapping != null &&
    input.oppositeHash != null &&
    input.mapping.lastHash != null &&
    input.oppositeHash !== input.mapping.lastHash &&
    input.incomingHash !== input.mapping.lastHash;

  if (bothChanged) {
    // D-01: DrChrono wins. If DrChrono is the source, its version is authoritative
    // and propagates. If GHL is the source while DrChrono also changed, the change
    // is non-trivial (concurrent divergence) → queue for manual review, skip action.
    if (input.source === 'drchrono') {
      return {
        action: 'write',
        target,
        payload: { ...input.incoming, _verb: verb },
        reason: 'D-01 DrChrono authoritative — propagate DrChrono version',
      };
    }
    return {
      action: 'queue-conflict',
      target: null,
      payload: null,
      reason: 'D-01 concurrent divergence with GHL source — manual review queued',
    };
  }

  // 5. Reschedule or normal create/update: single-sided change → propagate.
  const reason = RESCHEDULE.has(verb)
    ? `D-02 reschedule propagates ${input.source} -> ${target}`
    : `${verb} propagates ${input.source} -> ${target}`;
  return {
    action: 'write',
    target,
    payload: { ...input.incoming, _verb: verb },
    reason,
  };
}
