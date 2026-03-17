import type { Request, Response } from 'express';
import { logger } from '../../logger.js';
import { getLocation } from '../../utils/common.js';
import { telegramService, type NotifyMessage } from './telegram.js';
import { clickupService } from './clickup.js';

const POST_LEVEL = process.env.POST_LEVEL || 'error';
const MSG_SERVICE = process.env.MSG_SERVICE || 'clickup';

const _getSeverityIndex = (severity: string) => {
  const sevArray = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  return sevArray.findIndex((sev) => sev === severity);
};

const tgLevel = _getSeverityIndex(POST_LEVEL);

const createController = () => {
  const notify = (req: Request, res: Response) => {
    const locHeader = (req.headers['x-tlp-app-location'] as string) || '';
    const nameHeader = (req.headers['x-tlp-app-name'] as string) || '';

    const loc = getLocation(locHeader);

    if (!loc.location || !loc.token) return res.sendStatus(401);

    const logMsg: NotifyMessage = req.body;
    console.log(logMsg);

    logMsg.location = loc.location;

    if (nameHeader.length > 0) {
      logMsg.name = nameHeader;
    }

    // log message
    switch (logMsg.severity.toLowerCase()) {
      case 'trace':
      case 'debug':
        logger.debug(logMsg.message);
        break;
      case 'info':
        logger.info(logMsg.message);
        break;
      case 'warn':
        logger.warn(logMsg.message);
        break;
      case 'error':
        logger.error(logMsg.message);
        break;
      case 'fatal':
        logger.fatal(logMsg.message);
        break;
    }

    const sev = _getSeverityIndex(logMsg.severity.toLowerCase());

    if (sev >= tgLevel) {
      if (MSG_SERVICE === 'telegram') {
        telegramService.sendMessage(logMsg);
      } else {
        clickupService.sendMessage(logMsg);
      }
    }

    return res.sendStatus(200);
  };

  return {
    notify,
  };
};

export const notificationController = createController();
