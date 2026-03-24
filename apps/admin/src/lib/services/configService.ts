import type { ConfigRecord } from "$lib/types/common";
import { apiGet, apiPost } from "$lib/api";

const createConfigService = () => {
  const getConfigs = async (_fetch?: any) => {
    return apiGet('/configs');
  }

  const getConfig = async (_fetch?: any, location?: string) => {
    return apiGet(`/config/${location}`);
  }

  const updateConfig = async (config: ConfigRecord) => {
    return apiPost(`/config/${config.location}`, config);
  }

  return {
    getConfigs,
    getConfig,
    updateConfig
  }
}

export const configService = createConfigService();
