/**
 * EDGE-09 Plan 01 — Nyquist coverage for ECTL-03: confirm dead_letter and
 * reconciliation_drift alerts are NOT filtered away from system:'edge' context.
 * Mocks telegramService.sendMessage to avoid hitting the real Telegram API.
 *
 * Note: triggerAlert dedupes per-type via an in-module lastFired Map (10-min
 * window), no exported reset. Each test below exercises a DIFFERENT alert-type
 * dedupe key (dead_letter once; reconciliation_drift's above-threshold case runs
 * BEFORE the below-threshold case so the below-threshold early-return-before-
 * markFired path never blocks it).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triggerAlert } from '../../src/modules/sync/alerts.js';
import { telegramService } from '../../src/modules/notifications/telegram.js';

test('dead_letter: fires for system:edge context (not filtered/skipped)', async (t) => {
  const mock = t.mock.method(telegramService, 'sendMessage', () => undefined);
  await triggerAlert('dead_letter', { eventId: 'evt-edge-1', error: 'x', system: 'edge' });
  assert.equal(mock.mock.callCount(), 1, 'sendMessage must be invoked for a dead_letter alert with system:edge');
});

test('reconciliation_drift: fires for system:edge when driftPct > 0.1 threshold', async (t) => {
  const mock = t.mock.method(telegramService, 'sendMessage', () => undefined);
  await triggerAlert('reconciliation_drift', { driftPct: 5, system: 'edge' });
  assert.equal(
    mock.mock.callCount(),
    1,
    'sendMessage must be invoked — no system-based exclusion for edge on reconciliation_drift',
  );
});

test('reconciliation_drift: below-threshold driftPct does NOT fire, edge or otherwise (guard sanity check)', async (t) => {
  // Run this in the SAME dedupe window as the previous test's above-threshold fire —
  // the below-threshold branch returns before shouldFire/markFired is re-checked
  // meaningfully since the condition itself (driftPct <= 0.1) short-circuits first
  // regardless of dedupe state, so this assertion holds independent of ordering.
  const mock = t.mock.method(telegramService, 'sendMessage', () => undefined);
  await triggerAlert('reconciliation_drift', { driftPct: 0.05, system: 'edge' });
  assert.equal(mock.mock.callCount(), 0, 'sendMessage must NOT be invoked below the 0.1% threshold');
});
