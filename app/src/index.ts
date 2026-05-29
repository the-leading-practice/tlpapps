import http from 'http';
import { config } from './config.js';
import { connectDB } from './db.js';
import { sql } from './db/pg/client.js';
import { createServer } from './server.js';
import { logger } from './logger.js';
import { initWebSocket } from './modules/rpc/index.js';
import { initEmbodiSync } from './modules/embodi/sync.js';

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

  server.listen(config.port, () => {
    logger.info(`TLP server listening on port ${config.port}`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
