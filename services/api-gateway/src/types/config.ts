export type TLS = {
	key: string;
	cert: string;
};

export type Protocol = {
	name: 'http' | 'https';
	port: string;
	hostname?: string;
	tls: TLS;
	enabled: boolean;
};

export type Http = {
	port: number;
	hostname?: string;
};

export type AuthEndpoint = {
	service: string;
	endpoint: string;
};

export type Https = {
	port: number;
	hostname?: string;
	tls: TLS[];
};

export type Service = {
	name: string;
	endpoint: string;
	host: string;
	target: string;
	port: number;
	enabled: boolean;
	auth: boolean;
};

export type Config = {
	protocols: Protocol[];
	authEndpoint: AuthEndpoint;
	services: Service[];
};

export type AuthInfo = {
	location: string;
	secret: string;
};
