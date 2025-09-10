export type NotifyMessage = {
	location?: string;
	name?: string;
	timestamp: string;
	severity: 'Trace' | 'Debug' | 'Info' | 'Warn' | 'Error' | 'Fatal';
	message: string;
};
