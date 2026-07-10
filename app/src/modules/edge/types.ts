/**
 * EDGE-01 — Titanium Edge credentials + calendar mapping module shapes.
 * Self-contained (D-01/EMOD-04): no imports from modules/config/.
 */

export interface EdgeConfigView {
  businessId: string | null;
  hasToken: boolean;
  signedOff: boolean;
  enabled: boolean;
  demoBusinessId?: string | null;
}

export interface EdgeCredInput {
  businessId?: string | null;
  token?: string;
  signedOff?: boolean;
  enabled?: boolean;
}

export interface EdgeMappingInput {
  ehrDoctorId?: string | null;
  ehrCalendarId: string;
  edgeBusinessId: string;
  edgeCalendarId?: string | null;
}

export interface EdgeMappingRow {
  ehrDoctorId: string | null;
  ehrCalendarId: string | null;
  edgeBusinessId: string;
  edgeCalendarId: string | null;
}

export interface EdgeConfigRepo {
  getConfig(location: string): Promise<EdgeConfigView | null>;
  upsertConfig(location: string, input: EdgeCredInput): Promise<EdgeConfigView>;
  listMappings(location: string): Promise<EdgeMappingRow[]>;
  upsertMappings(location: string, rows: EdgeMappingInput[]): Promise<EdgeMappingRow[]>;
}

/**
 * EDGE-03/04/05 — shared tenant context for Edge module wrappers
 * (contacts/calendar/conversations). D-01 shape.
 */
export interface EdgeCtx {
  edgeBusinessId: string;
  token: string;
  calendarId?: string;
  locationId?: string;
}

/** Maps EdgeCtx -> EDGE-02 EdgeFetchContext; locationId falls back to edgeBusinessId. */
export function toFetchCtx(ctx: EdgeCtx): { token: string; locationId?: string } {
  return { token: ctx.token, locationId: ctx.locationId || ctx.edgeBusinessId };
}

/** Test seam shared by all edge/* wrapper modules. */
export interface EdgeDeps {
  fetchImpl?: typeof fetch;
}

/** Edge contact create/update payload (EMOD-01). No pipeline/custom-field concepts. */
export interface EdgeContactInput {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  lifecycleStage?: string;
  contactType?: 'lead' | 'prospect' | 'client' | 'partner' | 'staff' | 'agent';
  source?: string;
}

/** Edge contact response shape. */
export interface EdgeContactRecord {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  lifecycle_stage?: string;
  contact_type?: string;
  source?: string;
  lead_score?: number;
  [key: string]: unknown;
}
