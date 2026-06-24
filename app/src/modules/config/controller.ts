import type { Request, Response } from 'express';
import { configService } from './services.js';
import { AccessTokenModel } from '../../models/accessToken.js';

const createController = () => {
  const getAllConfigs = async (_req: Request, res: Response) => {
    const configs = await configService.getAllConfigs();

    // Config rows carry only `location`, no human-readable practice name. Look up
    // the matching accessTokens record per location so the admin list can show a
    // title instead of "undefined". Best-effort: name is null when no practice
    // record exists for that location.
    const practices = await AccessTokenModel.find({}, { location: 1, name: 1 }).lean();
    const nameByLocation = new Map(practices.map((p) => [p.location, p.name]));

    const result = configs.map((c) => ({
      ...c,
      name: nameByLocation.get(c.location) ?? null,
    }));

    res.status(200).json(result);
  };

  const getConfig = async (req: Request, res: Response) => {
    const location = req.params.location as string;
    if (!location) return res.status(400).json({ status: 'invalid format: missing location' });

    const config = await configService.getConfig(location);
    if (!config) return res.sendStatus(404);

    return res.status(200).json(config);
  };

  const updateConfig = async (req: Request, res: Response) => {
    const location = req.params.location as string;
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
