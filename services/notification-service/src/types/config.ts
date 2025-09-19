export type Config = {
	service: Service;
	logging: LoggingType;
	msgService: string;
};

export type Service = {
	name: string;
	port: number;
};

export type LoggingType = {
	logPath: string;
	fileName: string;
};
