import { DRCHRONO_API } from 'lib/constants';
import { DrChronoTokenResponse } from 'types';
import { drChronoConfigService } from './drChronoConfig/drChronoConfig';

const TOKEN_ENDPOINT = `${DRCHRONO_API}/o/token/`;

const createDrChronoAuth = () => {

  /**
   * Exchange an authorization code for access + refresh tokens.
   * Called once per location during the initial OAuth setup flow.
   */
  const exchangeCode = async (
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ) => {
    const resp = await fetch( TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams( {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      } )
    } );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json() as DrChronoTokenResponse;
      return { status: resp.status, data };
    }
    return { status: resp.status, data: resp.statusText };
  }

  /**
   * Use a stored refresh_token to obtain a new access_token.
   * Persists updated tokens back to MongoDB.
   */
  const refreshAccessToken = async (
    locationName: string,
    clientId: string,
    clientSecret: string,
    storedRefreshToken: string
  ) => {
    const resp = await fetch( TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams( {
        grant_type: 'refresh_token',
        refresh_token: storedRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      } )
    } );

    if( resp.status >= 200 && resp.status < 300 ) {
      const data = await resp.json() as DrChronoTokenResponse;
      const expiry = Date.now() + data.expires_in * 1000;

      await drChronoConfigService.updateLocationTokens(
        locationName,
        data.access_token,
        data.refresh_token,
        expiry
      );

      return { status: resp.status, data };
    }

    return { status: resp.status, data: resp.statusText };
  }

  /**
   * Returns a valid access token for a location, refreshing if within 5 minutes of expiry.
   */
  const getValidToken = async (
    locationName: string,
    clientId: string,
    clientSecret: string,
    accessToken: string,
    storedRefreshToken: string,
    tokenExpiry: number
  ): Promise<{ status: number; accessToken: string }> => {
    const fiveMinutes = 5 * 60 * 1000;

    if( Date.now() < tokenExpiry - fiveMinutes ) {
      return { status: 200, accessToken };
    }

    console.log( `refreshing token for ${locationName}` );
    const resp = await refreshAccessToken( locationName, clientId, clientSecret, storedRefreshToken );

    if( resp.status >= 200 && resp.status < 300 ) {
      const tokenData = resp.data as DrChronoTokenResponse;
      return { status: 200, accessToken: tokenData.access_token };
    }

    console.error( `token refresh failed for ${locationName}: ${resp.data}` );
    return { status: resp.status, accessToken: '' };
  }

  return {
    exchangeCode,
    refreshAccessToken,
    getValidToken,
  }
}

export const drChronoAuth = createDrChronoAuth();
