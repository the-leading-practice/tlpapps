import { load } from 'js-yaml';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { Config } from './types/config.js';
import { ENV } from './constants/constants.js';

const getConfig = (): Config => {
	const configFile = ENV === 'development' ? 'dev.service.config.yml' : 'service.config.yml';

	const contents = fs.readFileSync(`config/${configFile}`, 'utf8');
	const data: Config = load(contents) as Config;

	return data;
};

export default getConfig;

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);
