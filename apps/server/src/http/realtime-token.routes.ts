import type { FastifyPluginAsync } from 'fastify';
import { RealtimeTokenRequestSchema } from '@live-translator/protocol';
import type { AppConfig } from '../config/index.js';
import { issueRealtimeToken } from '../auth/realtime-token.js';

export function realtimeTokenRoutes(config: AppConfig): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/realtime/token', async (request, reply) => {
      const body = RealtimeTokenRequestSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request' });
      }

      const issued = issueRealtimeToken(config);
      const host = request.headers.host ?? `localhost:${config.PORT}`;
      const proto =
        request.headers['x-forwarded-proto'] === 'https' || config.NODE_ENV === 'production'
          ? 'wss'
          : 'ws';

      return {
        token: issued.token,
        expiresAt: issued.expiresAt,
        wsUrl: `${proto}://${host}/ws/realtime`,
        userId: issued.userId,
      };
    });
  };
}
