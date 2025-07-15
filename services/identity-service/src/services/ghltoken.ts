import { CLIENT_ID, CLIENT_SECRET, GHL_API_URL, GHL_API_VERSION, REDIRECT_URL } from "constants/constants";
import { fetchJson, safeJsonParse } from "utils/common";


const createGHLTokenService = () => {
  const getAccessToken = async( code: string ) => {
    const accessData = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code: code,
      user_type: "Location",
      redirect_uri: REDIRECT_URL
    }

    let formBody : string[] = [];
    const keys = Object.keys( accessData );
    type ObjectKey = keyof typeof accessData;

    keys.forEach( ( key )=>{
      let encodedKey = encodeURIComponent( key );
      let encodedVal = encodeURIComponent( accessData[key as ObjectKey] );

      formBody.push( `${encodedKey}=${encodedVal}` );
      
    } );

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.join( "&" )
    }
    
		// TODO - abstract this out further
		// try {
    // 	const resp = await fetch( 'https://services.leadconnectorhq.com/oauth/token', options );
    // 	const dataStr = await resp.text();
    
		// 	if( resp.status >= 200 && resp.status < 300 ) {
		// 		const json = safeJsonParse( dataStr );
		// 		return {status: resp.status, data: json};
		// 	}

		// 	return {status: resp.status, data: dataStr};
		// } catch( error: unknown ) {
		// 	if( error instanceof Error ) {
		// 		return {status: -1, data: error.message}
		// 	}
		// 	else {
		// 		return {status: -1, data: "unknown error type"}
		// 	}
		// }

		const resp = await fetchJson( `${GHL_API_URL}/oauth/token`, options );
		return resp;
  }

  const renewAuthToken = async( code: string ) => {
    const accessData = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: code,
      user_type: "Location"
    }

    let formBody : string[] = [];
    const keys = Object.keys( accessData );
    type ObjectKey = keyof typeof accessData;

    keys.forEach( ( key )=>{
      let encodedKey = encodeURIComponent( key );
      let encodedVal = encodeURIComponent( accessData[key as ObjectKey] );

      formBody.push( `${encodedKey}=${encodedVal}` );
      
    } );

    const options = {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formBody.join( "&" )
    }
    
		// try{
		// 	const resp = await fetch( `${GHL_API_URL}/oauth/token`, options );

		// 	const dataStr = await resp.text();
			
		// 	if( resp.status >= 200 && resp.status < 300 ) {
		// 		const json = safeJsonParse( dataStr );
		// 		return {status: resp.status, data: json};
		// 	}

		// 	return {status: resp.status, data: dataStr};
		// } catch( error: unknown ) {
		// 	if( error instanceof Error ) {
		// 		return {status: -1, data: error.message}
		// 	}
		// 	else {
		// 		return {status: -1, data: "unknown error type"}
		// 	}
		// }
		const resp = await fetchJson( `${GHL_API_URL}/oauth/token`, options );
		return resp;
  }

  const getLocationData = async( locationId: string, token: string ) => {
    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'version': GHL_API_VERSION
      }
    };

    console.log( `GET: ${GHL_API_URL}/locations/${locationId}` );

		// try {
		// 	const resp = await fetch( `${GHL_API_URL}/locations/${locationId}`, options );
		// 	const dataStr = await resp.text();
			
		// 	if( resp.status >= 200 && resp.status < 300 ) {
		// 		const json = safeJsonParse( dataStr );
		// 		return {status: resp.status, data: json};
		// 	}

		// 	return {status: resp.status, data: dataStr};
		// } catch( error: unknown ) {
		// 	if( error instanceof Error ) {
		// 		return {status: -1, data: error.message}
		// 	}
		// 	else {
		// 		return {status: -1, data: "unknown error type"}
		// 	}
		// }
		const resp = await fetchJson( `${GHL_API_URL}/locations/${locationId}`, options );
		return resp;
  }

  return {
    getAccessToken,
    renewAuthToken,
    getLocationData
  }
}

export const ghlTokenService = createGHLTokenService();