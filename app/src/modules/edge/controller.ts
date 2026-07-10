import type { Request, Response } from 'express';
import { edgeConfigRepo } from './repo.pg.js';
import type { EdgeMappingInput } from './types.js';

const createController = () => {
  const getConfig = async (req: Request, res: Response) => {
    const location = req.params.location as string;
    if (!location) return res.status(400).json({ status: 'invalid format: missing location' });

    const view = await edgeConfigRepo.getConfig(location);
    if (!view) return res.sendStatus(404);
    return res.status(200).json(view);
  };

  const upsertConfig = async (req: Request, res: Response) => {
    const location = req.params.location as string;
    if (!location) return res.sendStatus(400);

    const { businessId, token, signedOff, enabled } = req.body ?? {};
    const view = await edgeConfigRepo.upsertConfig(location, {
      businessId,
      token,
      signedOff,
      enabled,
    });
    return res.status(200).json(view);
  };

  const getMappings = async (req: Request, res: Response) => {
    const location = req.params.location as string;
    if (!location) return res.status(400).json({ status: 'invalid format: missing location' });

    const rows = await edgeConfigRepo.listMappings(location);
    return res.status(200).json(rows);
  };

  const upsertMappings = async (req: Request, res: Response) => {
    const location = req.params.location as string;
    if (!location) return res.sendStatus(400);
    const body = req.body;
    if (!Array.isArray(body)) return res.sendStatus(400);

    const rows = await edgeConfigRepo.upsertMappings(location, body as EdgeMappingInput[]);
    return res.status(200).json(rows);
  };

  return { getConfig, upsertConfig, getMappings, upsertMappings };
};

export const edgeController = createController();
