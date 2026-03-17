import { DrChronoConfigModel } from './configModel';

const createDrChronoConfigService = () => {
  const getConfig = async () => {
    const config = await DrChronoConfigModel.findOne( {} );
    return config;
  }

  const updateLocationTokens = async (
    locationName: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiry: number
  ) => {
    await DrChronoConfigModel.updateOne(
      { 'locations.name': locationName },
      {
        $set: {
          'locations.$.accessToken': accessToken,
          'locations.$.refreshToken': refreshToken,
          'locations.$.tokenExpiry': tokenExpiry,
        }
      }
    );
  }

  return {
    getConfig,
    updateLocationTokens,
  }
}

export const drChronoConfigService = createDrChronoConfigService();
