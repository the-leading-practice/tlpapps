import express from 'express';
import compression from 'compression';
import cors from 'cors';
import morgan from 'morgan';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authToken } from './middleware/auth.js';

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

export function createServer() {
  const app = express();

  // Global middleware
  app.use(compression());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('short'));

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

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

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
