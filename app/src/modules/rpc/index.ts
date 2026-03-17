import type { Server } from 'http';
import { createWebsocketListener } from './socket.js';
import { logger } from '../../logger.js';

export type WebSocketModule = ReturnType<typeof createWebsocketListener>;

let wsModule: WebSocketModule | null = null;

/**
 * Initialize the WebSocket server on the given HTTP server instance.
 * Called once from server.ts after the HTTP server is created.
 */
export function initWebSocket(server: Server): WebSocketModule {
  if (wsModule) {
    logger.warn('WebSocket module already initialized');
    return wsModule;
  }

  wsModule = createWebsocketListener(server);
  logger.info('WebSocket server initialized');

  return wsModule;
}

/**
 * Get the current WebSocket module instance.
 * Returns null if not yet initialized.
 */
export function getWebSocket(): WebSocketModule | null {
  return wsModule;
}
