import * as http from 'http';

const createDockerService = () => {
	const unixSocket = '/var/run/docker.sock';

	const _httpCall = async( options: http.RequestOptions ) => {
		let status: number | undefined = 0;
		const apiReq = new Promise<string>( ( resolve, reject ) => {
			let data = '';

			http.request( options, ( res ) => {
				res.on( 'data', d => {
					data += d;
				} );

				res.on( 'end', () => {
					status = res.statusCode;
					resolve( data );
				} );

				res.on( 'error', ( error ) => {
					status = res.statusCode;
					reject( error );
				} );
			} );
		} );

		try {
			const resp = await apiReq;
			const json = JSON.parse( resp );

			return { status: status, data: json };

		} catch( error ) {
			console.error( error );
			return { status: status, data: {}, error: error };
		}
	};

	const list = async () => {
		const options = {
			socketPath: unixSocket,
			method: 'GET',
			path: '/containers/json'
		}

		const resp = await _httpCall( options );
		return resp;
	}

	const info = async () => {
		const options = {
			socketPath: unixSocket,
			method: 'GET',
			path: '/info'
		}

		// get info from docker service
		const resp = await _httpCall( options );
		return resp;
	}

	const stats = async ( id: string ) => {
		const options = {
			socketPath: unixSocket,
			method: 'GET',
			path: `/container/${id}/stats`
		}

		// get stats for provided container
		const resp = await _httpCall( options );
		return resp;
	}

	return {
		list,
		info, 
		stats
	}

}

export const dockerService = createDockerService();