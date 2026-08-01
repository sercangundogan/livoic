import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv();

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('*'),
  REALTIME_TOKEN_SECRET: z.string().min(8).default('dev-secret-change-me-in-production'),
  REALTIME_TOKEN_TTL_SECONDS: z.coerce.number().default(300),
  DEV_AUTH_MODE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  SPEECH_PROVIDER: z.enum(['mock', 'openai', 'deepgram']).default('mock'),
  TRANSLATION_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_WS_PAYLOAD_BYTES: z.coerce.number().default(65_536),
  AUDIO_SAMPLE_RATE: z.coerce.number().default(16_000),
  AUDIO_CHANNELS: z.coerce.number().default(1),
  CHUNK_DURATION_MS: z.coerce.number().default(100),
  OPENAI_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_MODEL: z.string().default('nova-2'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return ConfigSchema.parse(env);
}
