import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { AppConfig } from './config/index.js';
import { createLogger } from './observability/logger.js';
import { healthRoutes } from './http/health.routes.js';
import { realtimeTokenRoutes } from './http/realtime-token.routes.js';
import { usageRoutes } from './http/usage.routes.js';
import { UsageStore } from './usage/usage-store.js';
import { SessionManager } from './realtime/session-manager.js';
import { attachRealtimeGateway } from './realtime/realtime-gateway.js';

export async function buildApp(config: AppConfig) {
  const logger = createLogger(config.LOG_LEVEL);
  const usage = new UsageStore();
  const sessions = new SessionManager(
    config.SPEECH_PROVIDER,
    config.TRANSLATION_PROVIDER,
    usage,
    logger,
    config.OPENAI_API_KEY,
    config.DEEPGRAM_API_KEY,
    config.DEEPGRAM_MODEL,
  );

  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
  });

  await app.register(healthRoutes);
  await app.register(realtimeTokenRoutes(config));
  await app.register(usageRoutes(usage));

  app.get('/api/diagnostics', async (_request, reply) => {
    if (config.NODE_ENV === 'production') {
      return reply.status(404).send({ error: 'Not found' });
    }
    return {
      activeSessions: sessions.size(),
      speechProvider: config.SPEECH_PROVIDER,
      translationProvider: config.TRANSLATION_PROVIDER,
      hasOpenAiKey: Boolean(config.OPENAI_API_KEY),
      hasDeepgramKey: Boolean(config.DEEPGRAM_API_KEY),
      deepgramModel: config.DEEPGRAM_MODEL,
      devAuthMode: config.DEV_AUTH_MODE,
    };
  });

  await app.ready();
  attachRealtimeGateway(app.server, config, sessions, logger);

  return { app, logger, sessions, usage };
}
