import { configService } from '$lib/services/configService.js';
import type { PageLoad } from './$types';

export const load : PageLoad = async ( {fetch, params} ) => {
  let config = await configService.getConfig( fetch, params.slug )
  return { config }
}