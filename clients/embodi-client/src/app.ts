import { printCalendar } from 'utils/calendar.js';
import { embodiSync } from 'embodiSync.js';
import { tlpService } from 'services/tlp.js';
import { service } from 'service.js';
import getConfig from './config.js';
import registry from 'registry.js';
import type { Config } from './types/config.js';
import { LocationSetting } from 'types/types.js';
import { Cron } from 'croner';

const config: Config = getConfig();

// load up locations and save to registry
const locations: LocationSetting[] = [];
config.locations.forEach((loc) => {
	locations.push({
		locationId: loc.locationId,
		secret: loc.secret,
		token: '',
		ttl: 0,
	});
});

registry.set('locations', locations);

if (locations.length > 0) {
	const srvConfig = await tlpService.login(locations[0].locationId, locations[0].secret);

	if (srvConfig) {
		locations[0].token = srvConfig.token;
		registry.set('locations', locations);
	}
}

console.log(registry.get('locations'));

// schedule the cron job to run at 8am every morning
const syncJob = new Cron('0 */5 * * * *');

syncJob.schedule(async () => {
	const today = new Date();
	const nextweek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

	await embodiSync.login();
	await embodiSync.sync(today);
	await embodiSync.sync(nextweek);
});

// start up the hooks listener
service.start();
