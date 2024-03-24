export type Token = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  userType: string;
  hashedCompanyId: string;
  locationId: string;
};

export type AccessToken = {
  location: string;
  name: string;
  calendar: string;
  timezone: string;
  secret: string;
  token: string;
  pushGHL: boolean;
  pushAppt: boolean;
  pushPat: boolean;
  software: string;
}

export type TableSQL = {
  Name: string;
  UniqueField: string;
  SqlQuery: string;
  Endpoint?: string;
}

export type AppConfig = {
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
  Tables: TableSQL[];
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
  active?: boolean;
  user?: UserData;
}