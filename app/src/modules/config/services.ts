import { configRepo } from './index.js';

/**
 * configService — thin facade over the active config repo (mongo|pg, chosen by
 * CONFIG_PRIMARY in ./index.ts). Kept as a named export so existing consumers
 * (config/controller.ts, webhooks/controller.ts) need no change.
 */
const createConfigService = () => {
  const getAllConfigs = async () => {
    return configRepo.getAllConfigs();
  };

  const getConfig = async (location: string) => {
    return configRepo.getConfig(location);
  };

  const updateConfig = async (location: string, newConfig: any) => {
    return configRepo.updateConfig(location, newConfig);
  };

  return {
    getAllConfigs,
    getConfig,
    updateConfig,
  };
};

export const configService = createConfigService();
