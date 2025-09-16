export type Config = {
	service: Service;
	locations: Location[];
	crontab: string;
};

export type Location = {
	locationId: string;
	secret: string;
};

export type Service = {
	name: string;
	port: number;
};
