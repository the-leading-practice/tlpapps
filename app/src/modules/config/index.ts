import { config as appConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { mongoConfigRepo } from './repo.mongo.js';
import { pgConfigRepo } from './repo.pg.js';
import type { ConfigRepo } from './types.js';

/**
 * configRepo — the active config data-access layer.
 *
 * Reads + the authoritative write go to the store named by CONFIG_PRIMARY
 * (default 'mongo' → zero behavior change vs. pre-P03).
 *
 * Legacy-write mirroring only runs AFTER the cutover (primary='pg'): when
 * CONFIG_LEGACY_WRITE is on (default), each write is also mirrored best-effort
 * to Mongo so it stays a warm standby for the 14-day rollback window. A mirror
 * failure is logged but never fails the request (D-07). With primary='mongo'
 * there is NO secondary write — pure pre-P03 behavior, leaving PG untouched
 * until the orchestrator's controlled backfill.
 */
const usePg = appConfig.configPrimary === 'pg';
const primary: ConfigRepo = usePg ? pgConfigRepo : mongoConfigRepo;
const mirrorToMongo = usePg && appConfig.configLegacyWrite;

export const configRepo: ConfigRepo = {
  getAllConfigs: () => primary.getAllConfigs(),
  getConfig: (location) => primary.getConfig(location),
  async updateConfig(location, newConfig) {
    const result = await primary.updateConfig(location, newConfig);
    if (mirrorToMongo) {
      try {
        await mongoConfigRepo.updateConfig(location, newConfig);
      } catch (err) {
        logger.error({ err, location }, 'config legacy-write mirror to mongo failed (non-fatal)');
      }
    }
    return result;
  },
};

export type { ConfigRepo, ConfigDoc } from './types.js';
