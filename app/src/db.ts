import mongoose from 'mongoose';
import { config } from './config.js';
import { logger } from './logger.js';

export async function connectDB(): Promise<void> {
  if (!config.mongoConnString) {
    throw new Error('No MongoDB connection string configured');
  }

  await mongoose.connect(config.mongoConnString);
  logger.info(`Connected to MongoDB: ${mongoose.connection.name}`);

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });
}
