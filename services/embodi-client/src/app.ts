import { embodiSync } from './embodiSync.js';
import { tlpService } from './services/tlp.js';
import { service } from './service.js';
import getConfig from './config.js';
import registry from './registry.js';
import type { Config } from './types/config.js';
import { defaultAppConfig, LocationSetting } from './types/types.js';
import { Cron } from 'croner';
import logger from './logger.js';

const config: Config = getConfig();

logger.writeLog('info', '---Embodi Client Starting---');

const fullSync = async () => {
	const today = new Date();
	const nextweek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

	await embodiSync.login();

	locations.forEach(async (loc) => {
		await embodiSync.sync(today, loc);
		await embodiSync.sync(nextweek, loc);
	});
};

// load up locations and save to registry
const locations: LocationSetting[] = [];
config.locations.forEach((loc) => {
	locations.push({
		locationId: loc.locationId,
		secret: loc.secret,
		token: '',
		updated: new Date(),
		config: defaultAppConfig,
	});
});
registry.set('locations', locations);

// login to the tlp services for each location
for (const location of locations) {
	const srvConfig = await tlpService.login(location.locationId, location.secret);

	if (srvConfig) {
		location.token = srvConfig.token;
		location.config = { ...srvConfig.config };
		location.updated = new Date();
	}
}
console.log(registry.get('locations'));

// do a startup sync
fullSync();

// this is for single day testing only - leave behind - but keep commented
// const syncBlock = async (start: Date, end: Date, location: LocationSetting) => {
// 	await embodiSync.login();
// 	await embodiSync.syncRange(start, end, location);
// };
// const start = new Date('2025-09-18T12:00:00.000Z');
// const end = new Date('2025-09-18T21:00:00.000Z');
// syncBlock(start, end, locations[0]);

// schedule the cron job to run at 8am every morning
const syncJob = new Cron(config.crontab);

syncJob.schedule(() => {
	fullSync();
	logger.writeLog('info', `next sync at ${syncJob.nextRun()?.toString()}`);
});

logger.writeLog('info', `next sync at ${syncJob.nextRun()?.toString()}`);

// start up the hooks listener
service.start();
