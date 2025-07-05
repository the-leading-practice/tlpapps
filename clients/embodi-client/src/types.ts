export type Config = {
  connection: TLPConnection;
  clients: TLPClient[];
}

export interface TLPConnection {
  url: string;
  port?: number;
}

export type TLPClient = {
  name: string;
  location: string;
  secret: string;
  url: string;
}

export type SilkOneConfig = {
  config: {
    RepeatMilliseconds: number;
    TokenRefreshMilliseconds: number;
    MaxBatchSize: number;
  }
  locations: SilkOneConfigLocation[];
}

export type SilkOneConfigLocation = {
  location: string;
  clientId: string;
  secret: string;
}

export type APIResponse = {
  status: number;
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export type SilkOneAuthResponse = APIResponse & {
  data: TokenResponse | string;
}

export type SilkOneAppointment = {
  appointment_key: number;
  location_key: number;
  patient_key: number;
  provider_key: string;
  appointment_status: number;
  appointment_date: string;
  appointment_type: string;
  appointment_length: number;
}

export type PatientRequest = {
  patient_key: string;
}