/**
 * Thin adapter that exposes the legacy writeLog / addSlashes interface
 * used throughout the patient-service code, backed by the shared pino logger.
 */
import { logger as pino } from '../../logger.js';

const createLoggerAdapter = () => {
	const writeLog = (level: string, message: string) => {
		switch (level) {
			case 'trace':
				pino.trace(message);
				break;
			case 'debug':
				pino.debug(message);
				break;
			case 'info':
				pino.info(message);
				break;
			case 'warn':
				pino.warn(message);
				break;
			case 'error':
				pino.error(message);
				break;
			case 'fatal':
				pino.fatal(message);
				break;
			default:
				pino.info(message);
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
