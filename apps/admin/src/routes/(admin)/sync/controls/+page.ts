export const ssr = false;

// No server/universal data fetch here: controls + live feed load client-side in
// the component (onMount) so a transient auth/network error renders inline instead
// of a 500. Matches the other sync pages (events/conflicts/dead-letter).
export function load() {
  return { controls: [] as SyncControlRow[] };
}

export interface SyncControlRow {
  direction: 'drchrono_to_ghl' | 'ghl_to_drchrono';
  entity: 'patients' | 'appointments';
  mode: 'off' | 'dry' | 'on';
  env_ceiling: 'off' | 'dry' | 'on';
  effective_mode: 'off' | 'dry' | 'on';
  // Backend (Drizzle) returns camelCase keys. Snake_case kept optional for
  // tolerance against any older response shape.
  updatedAt?: string | null;
  updatedBy?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}
