import type { ConfigRecord } from "$lib/types/common";


const createConfigService = () => {
  const getConfigs = async ( fetch: any ) => {
    const url = "http://localhost:5650/configs";
    
    const resp = await fetch( url, {method: "GET"} )
    const json = await resp.json();
    
    return json;
  }

  const getConfig = async ( fetch: any, location: string ) => {
    const url = `http://localhost:5650/config/${location}`;
    
    const resp = await fetch( url, {method: "GET"} )
    const json = await resp.json();
    
    return json;
  }

  const updateConfig = async( config: ConfigRecord ) => {
    const url = `http://localhost:5650/config/${config.location}`;
    const body = JSON.stringify( config );
    console.log( body );

    const options = {
      method: "POST",
      header: {'Content-Type': 'application/json'},
      body: body
    };

    const resp = await fetch( url, options );
    return await resp.json();
  }

  return {
    getConfigs,
    getConfig,
    updateConfig
  }
}

export const configService = createConfigService();