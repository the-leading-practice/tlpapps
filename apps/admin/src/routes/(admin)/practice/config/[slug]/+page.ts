import { configService } from '$lib/services/configService.js';
import { edgeConfigService } from '$lib/services/edgeConfigService.js';
import type { PageLoad } from './$types';

export const load : PageLoad = async ( {fetch, params} ) => {
  let config = await configService.getConfig( fetch, params.slug )

  // EDGE-01 — Edge cred + mapping load alongside existing config. A brand-new
  // location 404s on GET /edge; treat that as "not configured yet" rather than
  // failing the whole page load.
  let edge = null;
  let edgeMappings: any[] = [];
  try {
    edge = await edgeConfigService.getEdge( params.slug );
  } catch (e) {
    edge = null;
  }
  try {
    edgeMappings = await edgeConfigService.getMappings( params.slug );
  } catch (e) {
    edgeMappings = [];
  }

  return { config, edge, edgeMappings }
}