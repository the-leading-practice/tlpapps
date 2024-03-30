import { SILK_ONE_API, SILK_ONE_ID, SILK_ONE_SECRET } from "lib/constants";

const createSilkOneAuth = () => {

  const getToken = async( id: string, secret: string ) => {
    const url = `${SILK_ONE_API}/oauth2/access_token`;

    if( id.length <= 0 || secret.length <= 0 ) return { status: 401, data: 'unauthorized' }

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams( {
        'grant_type': 'client_credentials',
        'client_id': id,
        'client_secret': secret
      } )
    };

    const resp = await fetch( url, options );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json();
      return {status: resp.status, data: data};
    }
    return {status: resp.status, data: resp.statusText};
  }

  return {
    getToken
  }
}

export const silkOneAuth = createSilkOneAuth();