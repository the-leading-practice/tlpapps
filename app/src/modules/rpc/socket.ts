import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../../logger.js';

export type SocketClient = {
  ws: WebSocket;
  isLoggedIn: boolean;
  isAlive: boolean;
  id: string;
  remoteAddr?: string;
};

const createWebsocketListener = (server: Server) => {
  const wss = new WebSocketServer({ server });
  const _clients: Map<string, SocketClient> = new Map();

  const heartbeat = (client: SocketClient) => {
    client.isAlive = true;
    _clients.set(client.id, client);
  };

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    logger.info(`new WebSocket client connected from ${request.socket.remoteAddress}`);

    const wsClient: SocketClient = {
      ws: ws,
      isLoggedIn: false,
      isAlive: false,
      id: '',
      remoteAddr: request.socket.remoteAddress,
    };

    ws.on('message', (data: Buffer) => {
      const cmd = JSON.parse(data.toString());
      logger.debug({ cmd }, 'ws message received');

      if (cmd.cmd === 'login') {
        logger.info(`ws login from ${cmd.location}`);
        _clients.set(cmd.location, wsClient);
        wsClient.id = cmd.location;
        wsClient.isAlive = true;
        wsClient.isLoggedIn = true;

        wsClient.ws.send(data);
      }
    });

    ws.on('pong', () => {
      logger.debug(`${wsClient.id} received a pong`);
      heartbeat(wsClient);
    });
  });

  const send = async (id: string, msg: string) => {
    const client = _clients.get(id);
    if (client) {
      client.ws.send(msg);
    }
  };

  const pingClients = async () => {
    _clients.forEach((client) => {
      // clean out dead connections
      if (client.isAlive === false) {
        logger.info(`${client.id} no longer connected, terminating`);
        _clients.delete(client.id);
        return client.ws.terminate();
      }

      client.ws.ping();
      client.isAlive = false;
      _clients.set(client.id, client);
    });
  };

  // Set up periodic ping every 30 seconds
  const pingInterval = setInterval(pingClients, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  return {
    send,
    pingClients,
  };
};

export { createWebsocketListener };
