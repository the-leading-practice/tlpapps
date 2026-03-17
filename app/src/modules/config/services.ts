import { ClientConfigModel } from '../../models/clientConfig.js';

const createConfigService = () => {
  const getAllConfigs = async () => {
    const configs = await ClientConfigModel.find({});
    return configs;
  };

  const getConfig = async (location: string) => {
    const config = await ClientConfigModel.findOne({ location: location }).exec();
    return config;
  };

  const updateConfig = async (location: string, newConfig: any) => {
    const config = await ClientConfigModel.findOneAndUpdate(
      { location: location },
      newConfig,
      { upsert: true, new: true },
    );
    return config;
  };

  return {
    getAllConfigs,
    getConfig,
    updateConfig,
  };
};

export const configService = createConfigService();
