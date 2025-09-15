import { load } from 'js-yaml';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { Config } from './types/config.js';

const getConfig = (): Config => {
	const contents = fs.readFileSync('config/service.config.yml', 'utf8');
	const data: Config = load(contents) as Config;

	console.log(data);
	return data;
};

export default getConfig;

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);
