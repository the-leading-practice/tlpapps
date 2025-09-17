export type Config = {
	service: Service;
	locations: Location[];
	crontab: string;
	hoursToSync: number;
};

export type Location = {
	locationId: string;
	secret: string;
};

export type Service = {
	name: string;
	port: number;
};
