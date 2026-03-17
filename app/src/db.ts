import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';

export async function connectDB(): Promise<void> {
  if (!config.mongoConnString) {
    logger.warn('No MongoDB connection string configured');
    return;
  }

  try {
    await mongoose.connect(config.mongoConnString);
    logger.info(`Connected to MongoDB: ${mongoose.connection.name}`);
  } catch (err) {
    logger.error({ err }, 'Failed to connect to MongoDB - server will start without database');
  }

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });
}
