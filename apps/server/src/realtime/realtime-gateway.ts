import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ClientEventSchema } from '@live-translator/protocol';
import type { AppConfig } from '../config/index.js';
import { verifyRealtimeToken } from '../auth/realtime-token.js';
import type { Logger } from '../observability/logger.js';
import type { SessionManager } from './session-manager.js';

export function attachRealtimeGateway(
  httpServer: HttpServer,
  config: AppConfig,
  sessions: SessionManager,
  logger: Logger,
): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/realtime',
    maxPayload: config.MAX_WS_PAYLOAD_BYTES,
  });

  wss.on('connection', (socket, request) => {
    void handleConnection(socket, request, config, sessions, logger);
  });

  return wss;
}

async function handleConnection(
  socket: WebSocket,
  request: IncomingMessage,
  config: AppConfig,
  sessions: SessionManager,
  logger: Logger,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const token = url.searchParams.get('token') ?? '';
  const verified = verifyRealtimeToken(token, config);

  if (!verified.ok) {
    logger.warn('ws_auth_failed', { reason: verified.reason });
    socket.close(4401, 'Unauthorized');
    return;
  }

  const userId = verified.payload.sub;
  let activeSessionId: string | undefined;

  logger.info('ws_connected', { userId });

  socket.on('message', (data, isBinary) => {
    void (async () => {
      try {
        if (isBinary) {
          if (!activeSessionId) return;
          const session = sessions.get(activeSessionId);
          if (!session) return;
          const buffer = Buffer.isBuffer(data)
            ? data
            : Buffer.from(data as ArrayBuffer);
          await session.handleAudio(buffer);
          return;
        }

        const text = typeof data === 'string' ? data : data.toString('utf8');
        const parsed = ClientEventSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          socket.send(
            JSON.stringify({
              type: 'error',
              sessionId: activeSessionId ?? '00000000-0000-0000-0000-000000000000',
              sequence: 0,
              timestamp: Date.now(),
              code: 'UNKNOWN_ERROR',
              message: 'Invalid message format.',
              recoverable: true,
            }),
          );
          return;
        }

        const event = parsed.data;
        activeSessionId = event.sessionId;
        const session = sessions.getOrCreate(event.sessionId, userId, socket);
        await session.handleClientEvent(event);

        if (event.type === 'session.stop') {
          await sessions.remove(event.sessionId);
          activeSessionId = undefined;
        }
      } catch (error) {
        logger.error('ws_message_error', {
          userId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    })();
  });

  socket.on('close', () => {
    logger.info('ws_disconnected', { userId, sessionId: activeSessionId });
    if (activeSessionId) {
      void sessions.remove(activeSessionId);
    }
  });
}
