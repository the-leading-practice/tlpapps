import { load } from 'js-yaml';
import * as fs from 'fs';
import type { Config } from 'types/config';
import { ENV } from 'constants/constants';

const getConfig = (): Config => {
	const configFile = ENV === 'development' ? 'dev.service.config.yml' : 'service.config.yml';

	const contents = fs.readFileSync(`config/${configFile}`, 'utf8');
	const data: Config = load(contents) as Config;

	return data;
};

export default getConfig;
