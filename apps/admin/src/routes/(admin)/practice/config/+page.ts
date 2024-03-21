import { configService } from '$lib/services/configService.js';
import type { PageLoad } from './$types';

export const load : PageLoad = async ( {fetch, params} ) => {
  let configs = await configService.getConfigs( fetch )
  return { configs }
}