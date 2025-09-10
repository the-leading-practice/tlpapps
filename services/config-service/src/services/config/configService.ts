import { appConfigModel } from './model.js';

const createConfigMongoService = () => {
	const getAllConfigs = async () => {
		const configs = await appConfigModel.find({});
		return configs;
	};

	const getConfig = async (location: string) => {
		const config = await appConfigModel.findOne({ location: location }).exec();
		return config;
	};

	const updateConfig = async (location: string, newConfig: any) => {
		const config = await appConfigModel.findOneAndUpdate({ location: location }, newConfig, {
			upsert: true,
			new: true,
		});
		return config;
	};

	return {
		getAllConfigs,
		getConfig,
		updateConfig,
	};
};

export const configMongoService = createConfigMongoService();
