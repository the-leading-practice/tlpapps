import { SilkOneConfig } from "types";
import { SilkOneConfigModel } from "./configModel";

const createSilkOneConfigService = () => {
  const getConfig = async () => {
    const config = await SilkOneConfigModel.findOne({});
    return config;
  }

  return {
    getConfig
  }
}

export const silkOneConfigService = createSilkOneConfigService();