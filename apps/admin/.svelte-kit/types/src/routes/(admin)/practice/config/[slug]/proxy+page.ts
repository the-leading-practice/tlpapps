// @ts-nocheck
import { configService } from '$lib/services/configService.js';
import type { PageLoad } from './$types';

export const load = async ( {fetch, params}: Parameters<PageLoad>[0] ) => {
  let config = await configService.getConfig( fetch, params.slug )
  return { config }
}