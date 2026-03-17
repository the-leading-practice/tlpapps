export type Slot = {
  date: Date;
  open: boolean;
  blocked: boolean;
  eventId: string;
};

export type Day = {
  date: Date;
  slots: Slot[];
};

export type TableSQL = {
  Name: string;
  UniqueField: string;
  SqlQuery: string;
  Endpoint?: string;
};

export type EmbodiAppConfig = {
  LastRun: string;
  DBProvider: string;
  UseCacheTable: boolean;
  TokenRefreshMilliseconds: number;
  AuthEndpoint: string;
  NotificationEndpoint: string;
  PatientEndpoint: string;
  AppointmentEndpoint: string;
  ConnectionString: string;
  RepeatMilliseconds: number;
  MaxBatchSize: number;
  Software: string;
  Tables: TableSQL[];
};

export const defaultEmbodiAppConfig: EmbodiAppConfig = {
  LastRun: '',
  DBProvider: '',
  UseCacheTable: false,
  TokenRefreshMilliseconds: 30000,
  AuthEndpoint: '',
  NotificationEndpoint: '',
  PatientEndpoint: '',
  AppointmentEndpoint: '',
  ConnectionString: '',
  RepeatMilliseconds: 900000,
  MaxBatchSize: 50,
  Software: '',
  Tables: [],
};

export type Dictionary<T> = { [key: string]: T };

export type EmbodiLocationSetting = {
  locationId: string;
  secret: string;
  token: string;
  config: EmbodiAppConfig;
  updated: Date;
};

export type EmbodiNotificationMessage = {
  message: string;
  severity: string;
  timestamp: string;
};

export type EmbodiConfig = {
  locations: EmbodiLocation[];
  crontab: string;
  hoursToSync: number;
};

export type EmbodiLocation = {
  locationId: string;
  secret: string;
};
