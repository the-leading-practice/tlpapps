import http from 'http';
import { config } from './config.js';
import { connectDB } from './db.js';
import { sql } from './db/pg/client.js';
import { createServer } from './server.js';
import { logger } from './logger.js';
import { initWebSocket } from './modules/rpc/index.js';
import { initEmbodiSync } from './modules/embodi/sync.js';
import { startEngine } from './modules/sync/engine.js';
import { initDrChronoPollCron } from './modules/drchrono/poll-cron.js';

async function main() {
  // Connect both databases on boot; fail fast if either is unreachable.
  await Promise.all([connectDB(), sql`select 1`]);
  logger.info('Connected to Postgres');

  const app = createServer();
  const server = http.createServer(app);

  // Initialize WebSocket server on the same HTTP server
  initWebSocket(server);

  // Initialize Embodi cron sync
  initEmbodiSync();

  // P08 DrChrono<->GHL sync engine (dry-run). No-op unless RUN_CRON=on; leader
  // election ensures exactly one replica runs the loop. No EHR writes in P08.
  startEngine();

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
