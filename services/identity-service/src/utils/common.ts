export const safeJsonParse = ( data: string ) => {
	let parsed;

	try {
		parsed = JSON.parse( data );
	} catch( e ) {
		console.log( (e as Error).message )
	}

	return parsed;
}

export type RequestRetryInit = RequestInit &{
	maxRetries: number;
}

export const fetchJson = async ( url: string, options: RequestInit ) => {
	let data;
	let status;
	let error = '';

	try {
		const resp = await fetch( url, options );
		status = resp.status;

		if( resp.ok ) {
			data = await resp.json();	
		} else {
			data = await resp.text();
			error = resp.statusText;
		}
	} catch( e: unknown ) {
		error = (e as Error).message;
		status = -1;
		data = null;

		if( e instanceof SyntaxError ) {
			console.log( `parsing error: ${e.message}` );
		}

		else if( e instanceof Error ) {
			console.log( `communication error: ${e.message}` );
		}
	}

	return {status, data, error};
}

export const fetchWithRetries = async ( url: string, options: RequestRetryInit, retryCount: number = 0 ): Promise<Response> => {
	const {maxRetries = 3, ...remainingOptions} = options;

	try {
		return await fetch( url, remainingOptions );
	} catch( error ) {
		if( retryCount < maxRetries ) {
			return fetchWithRetries( url, options, retryCount + 1 );
		}

		// max retries exceeded - bubble the error
		throw error;
	}
}
