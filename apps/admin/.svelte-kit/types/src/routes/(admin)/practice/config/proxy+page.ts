// @ts-nocheck
import { configService } from '$lib/services/configService.js';
import type { PageLoad } from './$types';

export const load = async ( {fetch, params}: Parameters<PageLoad>[0] ) => {
  let configs = await configService.getConfigs( fetch )
  return { configs }
}