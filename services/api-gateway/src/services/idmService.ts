import type { Service, AuthInfo, AuthEndpoint } from "types/config";

const createIdmService = () => {
  const login = async ( login: AuthInfo, idm: Service, auth: AuthEndpoint ) => {
    const options ={
      method: "POST",
      body: JSON.stringify( login ),
      headers:{"Content-Type":"application/json"}
    }

    let url = idm.host;
    url += idm.port ? `:${idm.port}` : "";
    url += idm.target ? `/${idm.target}` : "";
    url += auth.endpoint ? `/${auth.endpoint}` : "";

    const resp = await fetch( url, options );
    const json = await resp.json();

    return json;
  }

  return {
    login
  }
}

export const idmService = createIdmService();