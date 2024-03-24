
import { Socket } from 'dgram';
import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export type SocketClient = {
  ws: WebSocket;
  isLoggedIn: boolean;
  isAlive: boolean;
  id: string;
  remoteAddr?: string;
} 

const createWebsocketListener = () => {
  const wss = new WebSocketServer( {port: 5665 } )
  let _clients: Map<string, SocketClient> = new Map();

  const heartbeat = ( client: SocketClient ) => {
    client.isAlive = true;
    _clients.set( client.id, client );
  }

  wss.on( 'connection', ( ws: WebSocket, request: IncomingMessage, client: any ) => {
    console.log( `new client connected`, request.socket.remoteAddress );

    let wsClient: SocketClient = {
      ws: ws,
      isLoggedIn: false,
      isAlive: false,
      id: '',
      remoteAddr: request.socket.remoteAddress
    }

    ws.on( 'message', ( data: Buffer ) => {
      const cmd = JSON.parse( data.toString() );
      console.log( cmd );

      if( cmd.cmd === 'login' ) {
        console.log( `login from ${cmd.location}` );
        _clients.set( cmd.location, wsClient );
        wsClient.id = cmd.location;
        wsClient.isAlive = true;
        wsClient.isLoggedIn = true;
        console.log( 'added client to map' );

        wsClient.ws.send( data );
      }

      
    } );

    ws.on( 'pong', () => {
      console.log( `${wsClient.id} received a pong` );
      heartbeat( wsClient )
    } );
  } );

  const send = async( id: string, msg: string ) => {
    const client = _clients.get( id );

    if( client ) {
      client.ws.send( msg );
    }
  }

  const pingClients = async() => {
    _clients.forEach( (client) => {
      console.log( client.id, client.isAlive );
      // cleanout dead connections
      if( client.isAlive === false ) {
        console.log( `${client.id} no longer connected terminating` );
        _clients.delete( client.id );
        return client.ws.terminate();
      }

      client.ws.ping();
      client.isAlive = false;
      _clients.set( client.id, client );
    } );
  }

  return {
    send,
    pingClients
  }
}

export const websocketServer = createWebsocketListener();