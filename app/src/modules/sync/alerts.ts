/**
 * P10 T03 — Sync alert rules dispatched via the existing Telegram notifications module.
 *
 * Alert types:
 *   dead_letter       — a sync event moved to dead-letter status
 *   conflict_queue    — pending conflict queue > 50 entries
 *   oauth_failure     — DrChrono or GHL OAuth token refresh failed
 *   loop_detection    — loop-detection counter incremented
 *   reconciliation_drift — reconciliation drift > 0.1%
 *
 * 10-minute dedupe window per rule type prevents alert floods.
 */

import { count, eq } from 'drizzle-orm';
import { db } from '../../db/pg/client.js';
import { syncConflicts } from '../../db/pg/schema/sync.js';
import { telegramService } from '../notifications/telegram.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'sync-alerts' });

export type AlertType =
  | 'dead_letter'
  | 'conflict_queue'
  | 'oauth_failure'
  | 'loop_detection'
  | 'reconciliation_drift'
  // HEAL-01: silent-wrong INVARIANT-CHECK layer. Fired when a cron/manual invariant
  // pass detects a violation. ctx carries { invariant, detail, severity?, tier? }.
  | 'invariant_violation';

/** Last-fire timestamp per alert type for dedupe. */
const lastFired = new Map<string, number>();
const DEDUPE_MS = 10 * 60 * 1000; // 10 minutes

function shouldFire(key: string): boolean {
  const last = lastFired.get(key) ?? 0;
  return Date.now() - last > DEDUPE_MS;
}

function markFired(key: string): void {
  lastFired.set(key, Date.now());
}

function send(severity: 'Warn' | 'Error', message: string): void {
  telegramService.sendMessage({
    timestamp: new Date().toISOString(),
    severity,
    message,
  });
}

/**
 * Trigger an alert rule. Called fire-and-forget (.catch(()=>undefined)).
 * Each rule applies its own condition check before dispatching.
 */
export async function triggerAlert(
  type: AlertType,
  ctx: Record<string, unknown> = {},
): Promise<void> {
  try {
    switch (type) {
      case 'dead_letter': {
        if (!shouldFire(type)) return;
        markFired(type);
        send('Error', `[Sync] Dead-letter event: eventId=${ctx.eventId ?? 'unknown'} error=${ctx.error ?? ''}`);
        break;
      }

      case 'conflict_queue': {
        if (!shouldFire(type)) return;
        // Query current pending count before deciding to fire.
        const [row] = await db
          .select({ n: count() })
          .from(syncConflicts)
          .where(eq(syncConflicts.resolution, 'pending'));
        const queueSize = Number(row?.n ?? 0);
        if (queueSize <= 50) return;
        markFired(type);
        send('Warn', `[Sync] Conflict queue > 50: ${queueSize} pending conflicts require review.`);
        break;
      }

      case 'oauth_failure': {
        if (!shouldFire(type)) return;
        markFired(type);
        const system = typeof ctx.system === 'string' ? ctx.system : 'unknown';
        const location = typeof ctx.locationId === 'string' ? ctx.locationId : '';
        send(
          'Error',
          `[Sync] OAuth token refresh failure: system=${system}${location ? ` location=${location}` : ''} — sync writes will fail until refreshed.`,
        );
        break;
      }

      case 'loop_detection': {
        if (!shouldFire(type)) return;
        markFired(type);
        send(
          'Warn',
          `[Sync] Loop detection triggered: eventId=${ctx.eventId ?? 'unknown'} source=${ctx.source ?? '?'} — skipping write.`,
        );
        break;
      }

      case 'reconciliation_drift': {
        if (!shouldFire(type)) return;
        const driftPct = typeof ctx.driftPct === 'number' ? ctx.driftPct : 0;
        if (driftPct <= 0.1) return;
        markFired(type);
        send(
          'Error',
          `[Sync] Reconciliation drift ${driftPct.toFixed(2)}% > 0.1% threshold — data may be diverging.`,
        );
        break;
      }

      case 'invariant_violation': {
        // Per-INVARIANT dedupe (not per-type) so distinct invariants firing in the
        // same window are not suppressed by each other. ctx.invariant is the id.
        const invariant = typeof ctx.invariant === 'string' ? ctx.invariant : 'unknown';
        const key = `invariant_violation:${invariant}`;
        if (!shouldFire(key)) return;
        markFired(key);
        const severity: 'Warn' | 'Error' = ctx.severity === 'Error' ? 'Error' : 'Warn';
        const tier = typeof ctx.tier === 'string' ? ctx.tier : '';
        const detail = typeof ctx.detail === 'string' ? ctx.detail : JSON.stringify(ctx.detail ?? {});
        send(
          severity,
          `[Sync] INVARIANT VIOLATION ${invariant}${tier ? ` [${tier}]` : ''}: ${detail}`,
        );
        break;
      }

      default:
        log.warn({ type }, 'unknown alert type');
    }
  } catch (err) {
    log.error({ err, type }, 'alert dispatch failed');
  }
}
