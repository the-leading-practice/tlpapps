import { TLPClient, TLPConnection } from 'types';
import Websocket from 'ws';

export const createWebSocketClient = ( client: TLPClient, connection: TLPConnection ) => {
  let address = `ws://${connection.url}`;
  const _client = client;

  if( connection.port && connection.port > 0 ) {
    address += `:${connection.port}`;
  }

  const ws = new Websocket( address );

  ws.on( 'error', console.error );

  ws.on( 'open', () => {
    const hs = {
      cmd: 'login',
      location: _client.location,
      secret: _client.secret,
      msg: 'this is a handshake'
    };
    console.log( 'connect' );
    ws.send( JSON.stringify( hs ) );
  } );

  ws.on( 'ping', ( message: Buffer ) => {
    console.log( `${_client.location} received ping` );
  } );

  ws.on( 'message', ( data: Buffer ) => {
    console.log( data.toString() );
  } );
}