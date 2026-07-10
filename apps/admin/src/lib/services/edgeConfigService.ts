import { apiGet, apiPost } from "$lib/api";

export interface EdgeConfigView {
  businessId: string | null;
  hasToken: boolean;
  signedOff: boolean;
  enabled: boolean;
  demoBusinessId?: string | null;
}

export interface EdgeConfigSaveBody {
  businessId?: string | null;
  token?: string;
  signedOff?: boolean;
  enabled?: boolean;
}

export interface EdgeMappingRow {
  ehrDoctorId?: string | null;
  ehrCalendarId: string;
  edgeBusinessId: string;
  edgeCalendarId?: string | null;
}

const createEdgeConfigService = () => {
  const getEdge = async (location?: string): Promise<EdgeConfigView | null> => {
    if (!location) return null;
    return apiGet(`/config/${location}/edge`);
  };

  const saveEdge = async (location: string, body: EdgeConfigSaveBody): Promise<EdgeConfigView> => {
    return apiPost(`/config/${location}/edge`, body);
  };

  const getMappings = async (location?: string): Promise<EdgeMappingRow[]> => {
    if (!location) return [];
    return apiGet(`/config/${location}/edge/mappings`);
  };

  const saveMappings = async (location: string, rows: EdgeMappingRow[]): Promise<EdgeMappingRow[]> => {
    return apiPost(`/config/${location}/edge/mappings`, rows);
  };

  return { getEdge, saveEdge, getMappings, saveMappings };
};

export const edgeConfigService = createEdgeConfigService();
