/**
 * Shared config-module shapes. The repo interface returns the same nested
 * `{ location, config: {...} }` document the Mongoose model produced, so the
 * controller + webhook consumers are agnostic to the backing store.
 */

export interface ConfigTable {
  Name: string;
  UniqueField: string;
  formattedQuery?: string;
  SqlQuery: string;
  Endpoint?: string;
}

export interface ConfigBody {
  LastRun?: string;
  DBProvider?: string;
  UseCacheTable?: boolean;
  TokenRefreshMilliseconds?: number;
  AuthEndpoint?: string;
  NotificationEndpoint?: string;
  PatientEndpoint?: string;
  AppointmentEndpoint?: string;
  ConnectionString?: string;
  RepeatMilliseconds?: number;
  MaxBatchSize?: number;
  Software?: string;
  Tables?: ConfigTable[];
}

export interface ConfigDoc {
  location: string;
  config?: ConfigBody;
  // Mongo docs also carry _id; consumers tolerate extra fields.
  [key: string]: unknown;
}

export interface ConfigRepo {
  getAllConfigs(): Promise<ConfigDoc[]>;
  getConfig(location: string): Promise<ConfigDoc | null>;
  updateConfig(location: string, newConfig: ConfigDoc): Promise<ConfigDoc>;
}
