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
  TRANSCRIPT_CORRECTION_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  TRANSCRIPT_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.72),
  RETRANSCRIBE_TIMEOUT_MS: z.coerce.number().default(2500),
  AUDIO_BUFFER_MAX_SECONDS: z.coerce.number().default(45),
  RETRANSCRIBE_PROVIDER: z.enum(['mock', 'openai', 'none']).default('mock'),
  TOPIC_ROUTING_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  TOPIC_GAME_THRESHOLD: z.coerce.number().default(3),
  TOPIC_GENERAL_THRESHOLD: z.coerce.number().default(3),
  TOPIC_MINIMUM_MARGIN: z.coerce.number().default(1.5),
  TOPIC_GENERAL_SWITCH_SEGMENTS: z.coerce.number().default(2),
  TOPIC_GAME_SWITCH_SEGMENTS: z.coerce.number().default(1),
  TOPIC_CONTEXT_GAME_SEGMENTS: z.coerce.number().default(5),
  TOPIC_CONTEXT_GENERAL_SEGMENTS: z.coerce.number().default(5),
  TOPIC_CONTEXT_MIXED_SEGMENTS: z.coerce.number().default(3),
  TOPIC_CLASSIFIER_LLM_FALLBACK_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SENTENCE_ASSEMBLY_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  SENTENCE_HOLD_MIN_MS: z.coerce.number().default(250),
  SENTENCE_HOLD_DEFAULT_MS: z.coerce.number().default(650),
  SENTENCE_HOLD_UNCERTAIN_MS: z.coerce.number().default(450),
  SENTENCE_HOLD_STRONG_INCOMPLETE_MS: z.coerce.number().default(1000),
  SENTENCE_HOLD_MAX_MS: z.coerce.number().default(1200),
  SENTENCE_SHORT_GAP_MS: z.coerce.number().default(700),
  SENTENCE_HARD_GAP_MS: z.coerce.number().default(1500),
  SENTENCE_MAX_SEGMENTS: z.coerce.number().default(3),
  SENTENCE_MAX_DURATION_MS: z.coerce.number().default(10_000),
  SENTENCE_MAX_WORDS: z.coerce.number().default(45),
  SENTENCE_MAX_CHARACTERS: z.coerce.number().default(280),
  SENTENCE_MERGE_SCORE_THRESHOLD: z.coerce.number().default(4),
  SENTENCE_DIAGNOSTICS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return ConfigSchema.parse(env);
}
