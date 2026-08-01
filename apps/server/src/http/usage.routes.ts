import type { FastifyPluginAsync } from 'fastify';
import type { UsageStore } from '../usage/usage-store.js';

export function usageRoutes(usage: UsageStore): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/usage/:userId', async (request) => {
      const { userId } = request.params as { userId: string };
      return {
        userId,
        audioSecondsToday: Math.floor(usage.getTodaySeconds(userId)),
      };
    });
  };
}
