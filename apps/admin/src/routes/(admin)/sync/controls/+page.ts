import { apiGet } from '$lib/api';

export const ssr = false;

export async function load() {
  const data = await apiGet<{ controls: SyncControlRow[] }>('/sync/controls');
  return { controls: data.controls };
}

export interface SyncControlRow {
  direction: 'drchrono_to_ghl' | 'ghl_to_drchrono';
  entity: 'patients' | 'appointments';
  mode: 'off' | 'dry' | 'on';
  env_ceiling: 'off' | 'dry' | 'on';
  effective_mode: 'off' | 'dry' | 'on';
  updated_at: string;
  updated_by: string | null;
}
