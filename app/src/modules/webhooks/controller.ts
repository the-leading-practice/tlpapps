import type { Request, Response } from 'express';
import { configService } from '../config/services.js';
import { embodiController } from '../embodi/controller.js';
import { logger } from '../../logger.js';

const createController = () => {
  const index = async (req: Request, res: Response) => {
    res.status(200).json({ success: true });
    const data = { ...req.body };

    if (data.type && data.type.toLowerCase() === 'install') {
      await install(data);
    }
  };

  const hook = (req: Request, res: Response) => {
    logger.info({ body: req.body, headers: req.headers }, 'webhook received');
    res.status(200).json({ success: true });
  };

  const appointmentCreate = async (req: Request, res: Response) => {
    res.status(200).json({ success: true });

    const config = await configService.getConfig(req.body.locationId);
    if (config && config.config?.Software === 'Embodi') {
      logger.info('forwarding to embodi module');
      // Direct function call instead of HTTP call to embodi-client
      await embodiController.handleCreatedAppointment(req.body);
    }
  };

  const install = async (data: any) => {
    // In the old architecture this called identity-service via HTTP.
    // In the monolith, the identity module's locationAuth is imported directly.
    // The identity module is created by another agent - import when available.
    logger.info('install hook triggered');

    try {
      // Dynamic import to avoid circular dependency issues at startup
      const { controller: identityController } = await import('../identity/controller.js');
      if (identityController && typeof identityController.locationAuth === 'function') {
        // locationAuth expects (req, res) but the webhook only has data.
        // Create a minimal req-like object; locationAuth sends res.status(200) immediately
        // then processes asynchronously, so a no-op res is fine here.
        const fakeReq = { body: data } as any;
        const fakeRes = { status: () => ({ json: () => {} }) } as any;
        await identityController.locationAuth(fakeReq, fakeRes);
      }
    } catch (err) {
      logger.warn({ err }, 'identity module not yet available for install hook');
    }
  };

  const sample = (_req: Request, res: Response) => {
    res.status(200).json({
      message: 'success',
      code: 200,
      page: 'sample',
    });
  };

  return {
    index,
    hook,
    sample,
    appointmentCreate,
  };
};

export const webhookController = createController();
