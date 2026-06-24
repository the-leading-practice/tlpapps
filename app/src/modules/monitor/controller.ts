import type { Request, Response } from 'express';
import { dockerService } from './docker.js';

const createController = () => {
  // The docker service talks to the unix socket /var/run/docker.sock. When the
  // app runs without that socket mounted (local dev, non-docker hosts) the call
  // rejects or returns a non-2xx. Wrap every endpoint so it degrades to a clean
  // 503 with `available:false` instead of bubbling up as an Express 500. The
  // admin Monitor page handles loading/error/empty states off this contract.
  const unavailable = (res: Response, detail: unknown) =>
    res.status(503).json({
      error: 'monitor unavailable',
      available: false,
      detail: detail instanceof Error ? detail.message : String(detail),
    });

  const list = async (_req: Request, res: Response) => {
    try {
      const resp = await dockerService.list();
      if (resp.status < 200 || resp.status >= 300) return unavailable(res, resp.data);
      res.status(resp.status).send(resp.data);
    } catch (err) {
      unavailable(res, err);
    }
  };

  const info = async (_req: Request, res: Response) => {
    try {
      const resp = await dockerService.info();
      if (resp.status < 200 || resp.status >= 300) return unavailable(res, resp.data);
      res.status(resp.status).send(resp.data);
    } catch (err) {
      unavailable(res, err);
    }
  };

  const stats = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    try {
      const resp = await dockerService.stats(id);
      if (resp.status < 200 || resp.status >= 300) return unavailable(res, resp.data);
      res.status(resp.status).send(resp.data);
    } catch (err) {
      unavailable(res, err);
    }
  };

  return {
    list,
    info,
    stats,
  };
};

export const monitorController = createController();
