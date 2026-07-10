/**
 * BIDI-06 (OPS-02) — DrChrono poll cadence.
 *
 * When RUN_CRON=on, run `runFullPoll` on a fixed cadence (default every 15 min) so
 * DrChrono → GHL data stays fresh without a manual POST /api/drchrono/poll. No-op
 * unless RUN_CRON=on, mirroring the sync engine + embodi cron gating.
 *
 * SAFETY: this only schedules the EXISTING poll, which already routes every GHL write
 * through the allowlist (fail-closed for non-demo locations). It does NOT enable any
 * reverse (GHL→DrChrono) writer or flip any kill switch. Overlap-guarded so a slow poll
 * never stacks concurrent runs.
 */

import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { runFullPoll } from './services.js';
import { runAvailabilitySync } from '../sync/availability.js';

const log = logger.child({ module: 'drchrono-poll-cron' });

/** Poll cadence in minutes; override via DRCHRONO_POLL_CRON_MINUTES. Default 15. */
function cadenceMinutes(): number {
  const raw = parseInt(process.env.DRCHRONO_POLL_CRON_MINUTES || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

let running = false;

/**
 * Start the guarded DrChrono poll cron. No-op unless RUN_CRON=on. Idempotent
 * per-tick: a still-running poll causes the next tick to be skipped (no stacking).
 */
export async function initDrChronoPollCron(): Promise<void> {
  if (!config.runCron) {
    log.info('RUN_CRON disabled — DrChrono poll cron not started');
    return;
  }

  const minutes = cadenceMinutes();
  const crontab = `*/${minutes} * * * *`;

  try {
    const { Cron } = await import('croner');
    new Cron(crontab, async () => {
      if (running) {
        log.warn('DrChrono poll still running — skipping this tick');
        return;
      }
      running = true;
      try {
        log.info('DrChrono poll cron tick — runFullPoll');
        await runFullPoll();
        // DrChrono→GHL availability (blocked-time) mirror. No-op unless
        // SYNC_WRITE_AVAILABILITY is on AND the location is allowlisted AND mapped;
        // default OFF, so this is behavior-neutral until an operator enables it.
        await runAvailabilitySync();
      } catch (err) {
        log.error({ err }, 'DrChrono poll cron tick failed');
      } finally {
        running = false;
      }
    });
    log.info({ crontab }, 'DrChrono poll cron scheduled');
  } catch (err) {
    log.warn({ err }, 'croner not available, DrChrono poll cron disabled');
  }
}
