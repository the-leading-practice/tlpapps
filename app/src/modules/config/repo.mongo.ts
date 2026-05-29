import { ClientConfigModel } from '../../models/clientConfig.js';
import type { ConfigDoc, ConfigRepo } from './types.js';

/**
 * Mongo-backed config repository — the legacy data access extracted verbatim
 * from the old config/services.ts (find / findOne / findOneAndUpdate upsert).
 * Returns lean plain objects so the PG repo can mirror the exact shape.
 */
const toPlain = (doc: unknown): ConfigDoc | null => {
  if (!doc) return null;
  const d = doc as { toObject?: () => ConfigDoc };
  return typeof d.toObject === 'function' ? d.toObject() : (doc as ConfigDoc);
};

export const mongoConfigRepo: ConfigRepo = {
  async getAllConfigs() {
    const configs = await ClientConfigModel.find({});
    return configs.map((c) => toPlain(c)).filter((c): c is ConfigDoc => c !== null);
  },

  async getConfig(location) {
    const config = await ClientConfigModel.findOne({ location }).exec();
    return toPlain(config);
  },

  async updateConfig(location, newConfig) {
    const config = await ClientConfigModel.findOneAndUpdate({ location }, newConfig, {
      upsert: true,
      new: true,
    });
    return toPlain(config) as ConfigDoc;
  },
};
