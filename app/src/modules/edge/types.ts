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
