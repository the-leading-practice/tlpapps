import { slikOneAuth } from "services/auth";
import { createWebSocketClient } from "services/webSocketClient";
import { Config } from "types"

export const createWSClient = ( config: Config ) => {
  let _clients: any[] = [];

  // connect all configured clients
  const start = async () => {

    const resp = await slikOneAuth.getToken();
    console.log( resp );

    config.clients.forEach( (c) => {
      const client = createWebSocketClient( c, config.connection );
      _clients.push( client );
    } );
    
  }

  return {
    start
  }
}