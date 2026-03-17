/**
 * Thin adapter that exposes the legacy writeLog / addSlashes interface
 * used throughout the ghl-service code, backed by the shared pino logger.
 *
 * The GHL logger signature differs from the patient-service logger:
 *   writeLog(level, method, message, data?)
 */
import { logger as pino } from '../../logger.js';

const createLoggerAdapter = () => {
	const writeLog = (level: string, method: string, message: string, data?: any) => {
		const logObj = { method, data: data || null };

		switch (level) {
			case 'trace':
				pino.trace(logObj, message);
				break;
			case 'debug':
				pino.debug(logObj, message);
				break;
			case 'info':
				pino.info(logObj, message);
				break;
			case 'warn':
				pino.warn(logObj, message);
				break;
			case 'error':
				pino.error(logObj, message);
				break;
			case 'fatal':
				pino.fatal(logObj, message);
				break;
			default:
				pino.info(logObj, message);
		}
	};

	const addSlashes = (message: string, whitespace: boolean = false) => {
		let ret = message;
		ret = ret.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

		if (whitespace) {
			ret = ret
				.replace(/\u0008/g, '\\b') // eslint-disable-line
				.replace(/\t/g, '\\t')
				.replace(/\n/g, '\\n')
				.replace(/\f/g, '\\f')
				.replace(/\r/g, '\\r');
		}

		return ret;
	};

	return {
		writeLog,
		addSlashes,
	};
};

export const logger = createLoggerAdapter();
