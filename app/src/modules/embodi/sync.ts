import { embodiService, tlpService } from './services.js';
import registry from './registry.js';
import { logger } from '../../logger.js';
import type {
  EmbodiLocationSetting,
  Slot,
  Dictionary,
  EmbodiConfig,
  EmbodiLocation,
  defaultEmbodiAppConfig,
} from './types.js';

const EMBODI_API_USER = process.env.EMBODI_API_USER || '';
const EMBODI_API_PASS = process.env.EMBODI_API_PASS || '';
const EMBODI_HOURS_TO_SYNC = parseInt(process.env.EMBODI_HOURS_TO_SYNC || '10');

// ---------------------------------------------------------------------------
// Time utilities
// ---------------------------------------------------------------------------

const getWeekStartEnd = (start: Date) => {
  const sunday = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() - start.getDay(),
    8,
    0,
    0,
  );
  const saturday = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + (6 - start.getDay()),
    17,
    0,
    0,
  );
  return { start: sunday, end: saturday };
};

// ---------------------------------------------------------------------------
// Embodi Sync
// ---------------------------------------------------------------------------

const createEmbodiSync = () => {
  const login = async () => {
    if (EMBODI_API_USER.length === 0 || EMBODI_API_PASS.length === 0) {
      logger.error('cannot run embodi sync without a valid user or password');
      return;
    }

    const auth = await embodiService.login(EMBODI_API_USER, EMBODI_API_PASS);

    if (!auth || auth.token.length === 0) {
      logger.error('login to embodi failed');
    }
  };

  const getAvailability = async (start: Date, end: Date, location: EmbodiLocationSetting) => {
    const startTime = Math.floor(start.getTime() / 1000);
    const endTime = Math.floor(end.getTime() / 1000);

    const auth = registry.get('embodiAuth');
    if (!auth || auth.token.length === 0) {
      logger.error('no valid login with embodi returning');
      return undefined;
    }

    logger.info(
      `requesting availability for ${location.locationId} ${start.toString()} to ${end.toString()}`,
    );

    // get available slots from embodi
    const avail = await embodiService.checkAvailability(startTime, endTime, location.locationId);
    if (!avail) {
      logger.info('nothing available for the timeframe requested');
      return [];
    }

    logger.info(`found ${avail.availabilities.length} slots available`);

    // get existing blocks from GHL
    logger.info('requesting existing blocks for same timeframe');
    const blkResp = await tlpService.getBlock(start, end, location);

    if (blkResp.status !== 200) {
      logger.error(
        `error getting existing blocks from GHL ${blkResp.status} ${blkResp.data}`,
      );
      return {};
    }

    const blocks = JSON.parse(blkResp.data);

    const startIdx = start.getDay();
    const endIdx = end.getDay();

    const slots: Dictionary<Slot> = {};

    for (let x = startIdx; x <= endIdx; ++x) {
      const offset = startIdx === 0 && endIdx === 6 ? x : endIdx - x;
      const date = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + offset,
        8,
        0,
        0,
      );

      for (let y = 0; y < EMBODI_HOURS_TO_SYNC; ++y) {
        const top = new Date(date);
        top.setHours(12 + y); // TODO - this is a hack to get our times to match up

        const bottom = new Date(top);
        bottom.setMinutes(30);

        const topTime = Math.floor(top.getTime() / 1000);
        const bottomTime = Math.floor(bottom.getTime() / 1000);

        slots[topTime] = { date: top, blocked: false, open: false, eventId: '' };
        slots[bottomTime] = { date: bottom, blocked: false, open: false, eventId: '' };
      }
    }

    // filter available slots
    avail.availabilities.forEach((a: number) => {
      const top: Date = new Date(a * 1000);
      const bottom: Date = new Date(top);
      let saveBottom = false;

      if (top.getMinutes() === 0) {
        bottom.setMinutes(30);
      } else {
        bottom.setHours(bottom.getHours() + 1);
        bottom.setMinutes(0);
      }

      if (avail.duration > 30) saveBottom = true;

      const topTime = Math.floor(top.getTime() / 1000);
      if (slots[topTime]) {
        slots[topTime].open = true;
      }

      // block an hour
      if (saveBottom) {
        const bottomTime = Math.floor(bottom.getTime() / 1000);
        if (slots[bottomTime]) {
          slots[bottomTime].open = true;
        }
      }
    });

    // filter out already blocked slots
    for (const event of blocks.data.events) {
      const eventStart = Math.floor(new Date(event.startTime).getTime() / 1000);
      if (slots[eventStart]) {
        slots[eventStart].blocked = true;
        slots[eventStart].eventId = event.id;
      }
    }

    return slots;
  };

  const getWeekAvailability = async (date: Date, location: EmbodiLocationSetting) => {
    const week = getWeekStartEnd(date);
    return getAvailability(week.start, week.end, location);
  };

  const updateGHL = async (slots: any, location: EmbodiLocationSetting) => {
    const now = new Date();

    if (!location) {
      logger.error('location seems undefined - this should be impossible!!');
      return;
    }

    if (
      !location.config ||
      now.getTime() - location.updated.getTime() >= location.config.TokenRefreshMilliseconds
    ) {
      const resp = await tlpService.login(location.locationId, location.secret);
      location.token = resp.token;
      location.config = resp.config;
      location.updated = now;
    }

    if (!slots) return;

    const keys = Object.keys(slots);
    for (const key of keys) {
      const slot = slots[key];
      const start = slot.date;
      const end = new Date(start);

      if (start.getMinutes() === 0) {
        end.setMinutes(30);
      } else {
        end.setHours(end.getHours() + 1);
        end.setMinutes(0);
      }

      // we need to block this slot off
      if (!slot.blocked && !slot.open) {
        const resp = await tlpService.addBlock(start, end, location);

        if (resp.status >= 200 && resp.status <= 300) {
          logger.info(`added block to calendar: ${start.toISOString()} ${end.toISOString()}`);
        } else {
          logger.error(
            `failed to add block to calendar: ${start.toISOString()} ${end.toISOString()}`,
          );
        }
        continue;
      }

      // this slot is now available - delete block
      if (slot.blocked && slot.open) {
        const resp = await tlpService.deleteBlock(slot.eventId, location);
        if (resp.status === 200) {
          logger.info(`deleted block from calendar ${start.toISOString()} ${slot.eventId}`);
        } else {
          logger.error(
            `error deleting block from calendar ${start.toISOString()} ${slot.eventId} ${resp.data}`,
          );
        }
      }
    }
  };

  const sync = async (date: Date, location: EmbodiLocationSetting) => {
    const slots = await getWeekAvailability(date, location);
    await updateGHL(slots, location);
  };

  const syncRange = async (start: Date, end: Date, location: EmbodiLocationSetting) => {
    const slots = await getAvailability(start, end, location);
    await updateGHL(slots, location);
  };

  return {
    login,
    sync,
    syncRange,
  };
};

export const embodiSync = createEmbodiSync();

// ---------------------------------------------------------------------------
// Initialization & Cron scheduling
// ---------------------------------------------------------------------------

/**
 * Call this from server startup to load embodi locations, login, and start
 * the daily cron sync. Requires a config object with locations and crontab.
 */
export async function initEmbodiSync(embodiConfig: EmbodiConfig) {
  const { defaultEmbodiAppConfig } = await import('./types.js');

  const locations: EmbodiLocationSetting[] = [];
  embodiConfig.locations.forEach((loc: EmbodiLocation) => {
    locations.push({
      locationId: loc.locationId,
      secret: loc.secret,
      token: '',
      updated: new Date(),
      config: { ...defaultEmbodiAppConfig },
    });
  });
  registry.set('locations', locations);

  // login to TLP services for each location
  for (const location of locations) {
    const srvConfig = await tlpService.login(location.locationId, location.secret);
    if (srvConfig) {
      location.token = srvConfig.token;
      location.config = { ...srvConfig.config };
      location.updated = new Date();
    }
  }

  // do a startup sync
  const fullSync = async () => {
    const today = new Date();
    const nextweek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

    await embodiSync.login();

    for (const loc of locations) {
      await embodiSync.sync(today, loc);
      await embodiSync.sync(nextweek, loc);
    }
  };

  fullSync();

  // schedule the cron job
  try {
    const { Cron } = await import('croner');
    const syncJob = new Cron(embodiConfig.crontab);

    syncJob.schedule(() => {
      fullSync();
      logger.info(`next embodi sync at ${syncJob.nextRun()?.toString()}`);
    });

    logger.info(`embodi sync scheduled, next run at ${syncJob.nextRun()?.toString()}`);
  } catch (err) {
    logger.warn({ err }, 'croner not available, embodi cron sync disabled');
  }
}
