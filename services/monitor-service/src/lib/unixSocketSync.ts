import * as http from 'http';
import * as fs from 'fs';

export type HTTPCallResponse = {
	response: http.IncomingMessage | null;
	data: string;
};

export const requestSync = async (options: http.RequestOptions, postData?: any) => {
	return new Promise<HTTPCallResponse>((resolve, reject) => {
		let data = '';

		if ((options.socketPath && !fs.existsSync(options.socketPath)) || !options.socketPath) {
			reject(`no such socket ${options.socketPath}`);
		}

		const req = http.request(options, (res) => {
			res.on('data', (d) => {
				data += d;
			});

			res.on('end', () => {
				resolve({
					response: res,
					data: data,
				});
			});

			res.on('error', (error) => {
				reject(error);
			});
		});

		req.on('error', (error) => {
			reject(error);
		});

		if (postData) {
			req.write(postData);
		}

		req.end();
	});
};
