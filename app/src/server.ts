import express from 'express';
import compression from 'compression';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authToken } from './middleware/auth.js';
import { sql } from './db/pg/client.js';
import { apiReference } from '@scalar/express-api-reference';
import { syncOpenApiSpec } from './modules/sync/openapi.js';

// Module routers
import identityRoutes from './modules/identity/routes.js';
import patientRoutes from './modules/patients/routes.js';
import integrationRoutes from './modules/integration/routes.js';
import configRoutes from './modules/config/routes.js';
import edgeRoutes from './modules/edge/routes.js';
import notificationRoutes from './modules/notifications/routes.js';
import webhookRoutes from './modules/webhooks/routes.js';
import monitorRoutes from './modules/monitor/routes.js';
import embodiRoutes from './modules/embodi/routes.js';
import drchronoRoutes from './modules/drchrono/routes.js';
import adminRoutes from './modules/admin/routes.js';
import syncRoutes from './modules/sync/routes.js';
import syncCalendarMapRoutes from './modules/sync/calendar-map-routes.js';
import syncVerifySinkRoutes from './modules/sync/verify-sink-routes.js';

export function createServer() {
  const app = express();

  // Global middleware
  app.use(compression());
  app.use(cors());
  // Capture the raw request body so webhook HMAC verification (P09) can hash the exact
  // bytes GHL signed. Express's json parser otherwise discards the raw buffer.
  app.use(
    express.json({
      // 90-day poll batches many patients/appointments into one body; the default
      // 100kb limit overflows ("request entity too large"). Raise it generously.
      limit: '25mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
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

  // P10 T01 — Sync-only OpenAPI spec (D-03: sync routes only) + Scalar UI
  app.get('/openapi.json', (_req, res) => {
    res.json(syncOpenApiSpec);
  });
  app.use('/docs', apiReference({ spec: { url: '/openapi.json' } }));

  // Public routes (no auth required)
  app.use('/api', identityRoutes);
  app.use('/api', webhookRoutes);
  app.use('/api', drchronoRoutes);
  // P05 verify-mode capture sink (public; no EHR/JWT — verify works with no creds)
  app.use('/api', syncVerifySinkRoutes);

  // Protected routes (auth required)
  app.use('/api', authToken, patientRoutes);
  app.use('/api/ghl', authToken, integrationRoutes);
  app.use('/api', authToken, configRoutes);
  // EDGE-01 — Titanium Edge credential + calendar-mapping storage (no Edge API calls).
  app.use('/api', authToken, edgeRoutes);
  app.use('/api', authToken, notificationRoutes);
  app.use('/api', authToken, monitorRoutes);
  app.use('/api', authToken, embodiRoutes);
  app.use('/api', authToken, adminRoutes);
  app.use('/api', authToken, syncRoutes);
  app.use('/api', authToken, syncCalendarMapRoutes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
