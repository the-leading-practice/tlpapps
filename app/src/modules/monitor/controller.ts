import type { Request, Response } from 'express';
import { dockerService } from './docker.js';

const createController = () => {
  const list = async (_req: Request, res: Response) => {
    const resp = await dockerService.list();
    res.status(resp.status).send(resp.data);
  };

  const info = async (_req: Request, res: Response) => {
    const resp = await dockerService.info();
    res.status(resp.status).send(resp.data);
  };

  const stats = async (req: Request, res: Response) => {
    const id = req.params.id;
    const resp = await dockerService.stats(id);
    res.status(resp.status).send(resp.data);
  };

  return {
    list,
    info,
    stats,
  };
};

export const monitorController = createController();
