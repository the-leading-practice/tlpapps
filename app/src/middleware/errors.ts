import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error({ err, method: req.method, url: req.url }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}
