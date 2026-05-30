import express from 'express';
import compression from 'compression';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authToken } from './middleware/auth.js';
import { sql } from './db/pg/client.js';

// Module routers
import identityRoutes from './modules/identity/routes.js';
import patientRoutes from './modules/patients/routes.js';
import integrationRoutes from './modules/integration/routes.js';
import configRoutes from './modules/config/routes.js';
import notificationRoutes from './modules/notifications/routes.js';
import webhookRoutes from './modules/webhooks/routes.js';
import monitorRoutes from './modules/monitor/routes.js';
import embodiRoutes from './modules/embodi/routes.js';
import drchronoRoutes from './modules/drchrono/routes.js';
import adminRoutes from './modules/admin/routes.js';
import syncRoutes from './modules/sync/routes.js';

export function createServer() {
  const app = express();

  // Global middleware
  app.use(compression());
  app.use(cors());
  // Capture the raw request body so webhook HMAC verification (P09) can hash the exact
  // bytes GHL signed. Express's json parser otherwise discards the raw buffer.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('short'));

  // Health check — reports both Mongo and Postgres; 200 only if both ok
  app.get('/health', async (req, res) => {
    const mongo = mongoose.connection.readyState === 1 ? 'ok' : 'fail';

    let pg: 'ok' | 'fail' = 'ok';
    try {
      await sql`select 1`;
    } catch {
      pg = 'fail';
    }

    const status = mongo === 'ok' && pg === 'ok' ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({ mongo, pg, status });
  });

  // Public routes (no auth required)
  app.use('/api', identityRoutes);
  app.use('/api', webhookRoutes);
  app.use('/api', drchronoRoutes);

  // Protected routes (auth required)
  app.use('/api', authToken, patientRoutes);
  app.use('/api/ghl', authToken, integrationRoutes);
  app.use('/api', authToken, configRoutes);
  app.use('/api', authToken, notificationRoutes);
  app.use('/api', authToken, monitorRoutes);
  app.use('/api', authToken, embodiRoutes);
  app.use('/api', authToken, adminRoutes);
  app.use('/api', authToken, syncRoutes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
