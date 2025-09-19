import bunyan from 'bunyan';
import express from 'express';
import { NotifyMessage } from '../types/common.js';
import { getLocation } from '../utils/common.js';
import { telegramService } from '../services/telegram.js';
import { POST_LEVEL } from '../constants/constants.js';
import getConfig from '../config.js';
import { clickupService } from '../services/clickup.js';

const _getSeverityIndex = (severity: string) => {
	const sevArray = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
	const idx = sevArray.findIndex((sev) => sev === severity);

	return idx;
};

const createController = () => {
	const tgLevel = _getSeverityIndex(POST_LEVEL);
	const config = getConfig();

	const index = (req: express.Request, res: express.Response) => {
		const ret = {
			message: 'success',
			code: '200',
		};

		res.status(200).json(ret);
	};

	const notify = (req: express.Request, res: express.Response, log: bunyan) => {
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
				log.debug(logMsg.message);
				break;
			case 'info':
				log.info(logMsg.message);
				break;
			case 'warn':
				log.warn(logMsg.message);
				break;
			case 'error':
				log.error(logMsg.message);
				break;
			case 'fatal':
				log.fatal(logMsg.message);
				break;
		}

		const sev = _getSeverityIndex(logMsg.severity.toLowerCase());

		if (sev >= tgLevel) {
			// send to tg
			if (config.msgService === 'telegram') {
				telegramService.sendMessage(logMsg);
			} else {
				clickupService.sendMessage(logMsg);
			}
		}

		return res.sendStatus(200);
	};

	return {
		index,
		notify,
	};
};

export const controller = createController();
