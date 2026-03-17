import type { Request, Response } from 'express';
import { configService } from './services.js';

const createController = () => {
  const getAllConfigs = async (_req: Request, res: Response) => {
    const configs = await configService.getAllConfigs();
    res.status(200).json(configs);
  };

  const getConfig = async (req: Request, res: Response) => {
    const location = req.params.location;
    if (!location) return res.status(400).json({ status: 'invalid format: missing location' });

    const config = await configService.getConfig(location);
    if (!config) return res.sendStatus(404);

    return res.status(200).json(config);
  };

  const updateConfig = async (req: Request, res: Response) => {
    const location = req.params.location;
    const newConfig = { ...req.body };

    if (newConfig._id) delete newConfig._id;

    if (!newConfig) return res.sendStatus(400);
    if (!location) return res.sendStatus(400);

    const config = await configService.updateConfig(location, newConfig);
    return res.status(200).json(config);
  };

  return {
    getAllConfigs,
    getConfig,
    updateConfig,
  };
};

export const configController = createController();
