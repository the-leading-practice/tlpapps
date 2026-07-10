import http from 'http';
import { config } from './config.js';
import { connectDB } from './db.js';
import { sql } from './db/pg/client.js';
import { createServer } from './server.js';
import { logger } from './logger.js';
import { initWebSocket } from './modules/rpc/index.js';
import { initEmbodiSync } from './modules/embodi/sync.js';
import { startEngine } from './modules/sync/engine.js';
import { seedEdgeControls } from './modules/sync/edge-bootstrap.js';
import { initInvariantsCron } from './modules/sync/invariants.js';
import { initDrChronoPollCron } from './modules/drchrono/poll-cron.js';

async function main() {
  // Connect both databases on boot; fail fast if either is unreachable.
  await Promise.all([connectDB(), sql`select 1`]);
  logger.info('Connected to Postgres');

  // EDGE-06 Plan 01: idempotently seed the drchrono_to_edge sync_controls rows (off).
  // Runs AFTER migrations have committed (RUN_MIGRATIONS-gated, separate deploy step)
  // and BEFORE startEngine(). Failure is swallowed — absent rows already fail-closed.
  await seedEdgeControls().catch((err) => logger.warn({ err }, 'seedEdgeControls failed'));

  const app = createServer();
  const server = http.createServer(app);

  // Initialize WebSocket server on the same HTTP server
  initWebSocket(server);

  // Initialize Embodi cron sync
  initEmbodiSync();

  // P08 DrChrono<->GHL sync engine (dry-run). No-op unless RUN_CRON=on; leader
  // election ensures exactly one replica runs the loop. No EHR writes in P08.
  startEngine();

  // HEAL-01 self-heal INVARIANT-CHECK layer. READ-ONLY, alert-only. No-op unless
  // RUN_INVARIANTS=on. Independent of RUN_CRON so it can ship/flip on dark without
  // arming the sync engine. Ships behavior-neutral until the flag is enabled.
  initInvariantsCron();

  // BIDI-06 (OPS-02): periodic DrChrono poll. No-op unless RUN_CRON=on. Keeps
  // DrChrono->GHL data fresh; allowlist still gates every GHL write.
  initDrChronoPollCron().catch((err) =>
    logger.error({ err }, 'failed to init DrChrono poll cron'),
  );

  server.listen(config.port, () => {
    logger.info(`TLP server listening on port ${config.port}`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
