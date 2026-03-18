
export type DataShuttleConfigTable = {
  Name: string;
  Endpoint: string;
  UniqueField: string;
  SqlQuery: string;
  formattedQuery: string;
}

export type DataShuttleConfig = {
  LastRun: string;
  DBProvider: string;
  UseCacheTable: boolean;
  AuthEndpoint: string;
  NotificationEndpoint: string;
  PatientEndpoint: string;
  AppointmentEndpoint: string;
  ConnectionString: string;
  RepeatMilliseconds: number,
  Tables: DataShuttleConfigTable[];
  TokenRefreshMilliseconds: number;
  MaxBatchSize: number;
}

export type ConfigRecord = {
  name: string;
  location: string;
  config: DataShuttleConfig;
}

export type UserData = {
  firstName?: string;
  lastName?: string;
  lastLogin?: string;
  lastIpAddress?: string;
}

export type LoginData = {
  email?: string;
  password?: string;
  verified?: boolean;
  user?: UserData;
}

export type Practice = {
  _id?: string;
  name: string;
  location: string;
  software: string;
  calendarId?: string;
  timezone: string;
  pushGhl?: boolean;
  pushAppointments?: boolean;
  pushPatients?: boolean;
  patientCount?: number;
  appointmentCount?: number;
  lastSync?: string;
}

export type DashboardData = {
  totalPractices: number;
  totalPatients: number;
  totalAppointments: number;
  practices: Practice[];
}