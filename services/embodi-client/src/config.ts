import { load } from 'js-yaml';
import * as fs from 'fs';
import type { Config } from './types/config.js';

const getConfig = (): Config => {
	const contents = fs.readFileSync('config/service.config.yml', 'utf8');
	const data: Config = load(contents) as Config;

	return data;
};

export default getConfig;
