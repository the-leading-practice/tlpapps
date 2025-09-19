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
	MaxBatchSize: number;
	Software: string;
	Tables: TableSQL[];
};

export const defaultAppConfig: AppConfig = {
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
export type LocationSetting = {
	locationId: string;
	secret: string;
	token: string;
	config: AppConfig;
	updated: Date;
};

export type NotificationMessage = {
	message: string;
	severity: string;
	timestamp: string;
};
