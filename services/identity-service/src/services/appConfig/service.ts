import { appConfigModel } from './model';

const createAppConfigService = () => {
	const getConfig = async (location: string) => {
		const token = await appConfigModel.findOne({ location: location });
		return token;
	};

	return {
		getConfig,
	};
};

export const appConfigService = createAppConfigService();
