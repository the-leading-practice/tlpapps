import { AccessToken } from "types/types";
import { accessTokenModel } from "./model";

const createAccessTokenService = () => {

  const getTokenByLocation = async( location: string ) => {
    const token = await accessTokenModel.findOne( {location: location} );
    return token;
  }

  const getToken = async( location: string, secret: string ) => {
    const token = await accessTokenModel.findOne( {location: location, secret: secret} );
    return token;
  }

  const createToken = async( accessToken: AccessToken ) => {
    const newToken = await accessTokenModel.create( {
      name: accessToken.name,
      location: accessToken.location,
      calendar: accessToken.calendar,
      timezone: accessToken.timezone,
      secret: accessToken.secret,
      token: accessToken.token,
      pushGHL: accessToken.pushGHL,
      pushAppt: accessToken.pushAppt,
      pushPat: accessToken.pushPat,
      software: accessToken.software
    } );

    await newToken.save();
    return newToken;
  }

  const updateToken = async( accessToken: AccessToken ) => {
    const existingToken = await accessTokenModel.findOne( {location: accessToken.location} );

    if( existingToken ){
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

    const newToken = await createToken( accessToken );
    return newToken;
  }

  return {
    getToken,
    getTokenByLocation,
    createToken,
    updateToken,
  }
}

export const accessTokenService = createAccessTokenService();