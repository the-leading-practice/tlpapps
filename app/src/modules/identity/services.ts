import { config } from '../../config.js';
import { fetchJson } from '../../utils/fetch.js';
import { AccessTokenModel } from '../../models/accessToken.js';
import { AccountModel } from '../../models/account.js';
import { AppConfigModel } from '../../models/appConfig.js';
import type { AccessToken, LoginData, UserData } from './types.js';

// ---------------------------------------------------------------------------
// Access Token Service
// ---------------------------------------------------------------------------

const createAccessTokenService = () => {
  const getTokenByLocation = async (location: string) => {
    const token = await AccessTokenModel.findOne({ location: location });
    return token;
  };

  const getTokenByCompany = async (company: string) => {
    const token = await AccessTokenModel.findOne({ company: company });
    return token;
  };

  const getToken = async (location: string, secret: string) => {
    const token = await AccessTokenModel.findOne({ location: location, secret: secret });
    return token;
  };

  const createToken = async (accessToken: AccessToken) => {
    const newToken = await AccessTokenModel.create({
      company: accessToken.company,
      name: accessToken.name,
      location: accessToken.location,
      calendar: accessToken.calendar,
      timezone: accessToken.timezone,
      secret: accessToken.secret,
      token: accessToken.token,
      pushGHL: accessToken.pushGHL,
      pushAppt: accessToken.pushAppt,
      pushPat: accessToken.pushPat,
      software: accessToken.software,
    });

    await newToken.save();
    return newToken;
  };

  const updateToken = async (accessToken: AccessToken) => {
    const existingToken = await AccessTokenModel.findOne({ location: accessToken.location });

    if (existingToken) {
      existingToken.company = accessToken.company;
      existingToken.name = accessToken.name;
      existingToken.calendar = accessToken.calendar;
      existingToken.timezone = accessToken.timezone;
      existingToken.token = accessToken.token;
      existingToken.pushGHL = accessToken.pushGHL;
      existingToken.pushAppt = accessToken.pushAppt;
      existingToken.pushPat = accessToken.pushPat;
      existingToken.software = accessToken.software;
      await existingToken.save();

      return existingToken;
    }

    const newToken = await createToken(accessToken);
    return newToken;
  };

  return {
    getToken,
    getTokenByLocation,
    getTokenByCompany,
    createToken,
    updateToken,
  };
};

export const accessTokenService = createAccessTokenService();

// ---------------------------------------------------------------------------
// Account Service
// ---------------------------------------------------------------------------

const createAccountService = () => {
  const getAccount = async (email: string) => {
    const user = AccountModel.findOne({ email: email });
    return user;
  };

  const loginAccount = async (email: string, data: UserData) => {
    await AccountModel.findOneAndUpdate({ email: email }, data);
  };

  const addAccount = async (user: LoginData) => {
    const u = new AccountModel({ ...user });
    return u.save();
  };

  const updateAccount = async (user: LoginData) => {
    await AccountModel.findOneAndUpdate({ email: user.email }, user);
  };

  return {
    getAccount,
    loginAccount,
    addAccount,
    updateAccount,
  };
};

export const accountService = createAccountService();

// ---------------------------------------------------------------------------
// App Config Service
// ---------------------------------------------------------------------------

const createAppConfigService = () => {
  const getConfig = async (location: string) => {
    const token = await AppConfigModel.findOne({ location: location });
    return token;
  };

  return {
    getConfig,
  };
};

export const appConfigService = createAppConfigService();

// ---------------------------------------------------------------------------
// GHL Token Service
// ---------------------------------------------------------------------------

const createGHLTokenService = () => {
  const getAccessToken = async (code: string) => {
    const accessData = {
      client_id: config.ghl.clientId,
      client_secret: config.ghl.clientSecret,
      grant_type: 'authorization_code',
      code: code,
      user_type: 'Location',
      redirect_uri: config.ghl.redirectUrl,
    };

    const formBody: string[] = [];
    const keys = Object.keys(accessData);
    type ObjectKey = keyof typeof accessData;

    keys.forEach((key) => {
      const encodedKey = encodeURIComponent(key);
      const encodedVal = encodeURIComponent(accessData[key as ObjectKey]);
      formBody.push(`${encodedKey}=${encodedVal}`);
    });

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.join('&'),
    };

    const resp = await fetchJson(`${config.ghl.apiUrl}/oauth/token`, options);
    return resp;
  };

  const renewAuthToken = async (code: string) => {
    const accessData = {
      client_id: config.ghl.clientId,
      client_secret: config.ghl.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: code,
      user_type: 'Location',
    };

    const formBody: string[] = [];
    const keys = Object.keys(accessData);
    type ObjectKey = keyof typeof accessData;

    keys.forEach((key) => {
      const encodedKey = encodeURIComponent(key);
      const encodedVal = encodeURIComponent(accessData[key as ObjectKey]);
      formBody.push(`${encodedKey}=${encodedVal}`);
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.join('&'),
    };

    const resp = await fetchJson(`${config.ghl.apiUrl}/oauth/token`, options);
    return resp;
  };

  const getLocationData = async (locationId: string, token: string) => {
    const options = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        version: config.ghl.apiVersion,
      },
    };

    console.log(`GET: ${config.ghl.apiUrl}/locations/${locationId}`);

    const resp = await fetchJson(`${config.ghl.apiUrl}/locations/${locationId}`, options);
    return resp;
  };

  return {
    getAccessToken,
    renewAuthToken,
    getLocationData,
  };
};

export const ghlTokenService = createGHLTokenService();
