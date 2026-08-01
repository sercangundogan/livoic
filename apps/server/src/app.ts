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
import {
  collectProductionReadinessWarnings,
  estimateAudioBufferBytes,
  logProductionReadiness,
} from './transcript-correction/index.js';
import { TOPIC_CLASSIFIER_CONFIG } from './topic-routing/index.js';

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
    {
      enabled: config.TRANSCRIPT_CORRECTION_ENABLED,
      confidenceThreshold: config.TRANSCRIPT_CONFIDENCE_THRESHOLD,
      retranscribeTimeoutMs: config.RETRANSCRIBE_TIMEOUT_MS,
      audioBufferMaxSeconds: config.AUDIO_BUFFER_MAX_SECONDS,
      retranscribeProvider: config.RETRANSCRIBE_PROVIDER,
    },
    config.AUDIO_SAMPLE_RATE,
    {
      enabled: config.TOPIC_ROUTING_ENABLED,
      gameThreshold: config.TOPIC_GAME_THRESHOLD,
      generalThreshold: config.TOPIC_GENERAL_THRESHOLD,
      minimumMargin: config.TOPIC_MINIMUM_MARGIN,
      generalSwitchSegments: config.TOPIC_GENERAL_SWITCH_SEGMENTS,
      gameSwitchSegments: config.TOPIC_GAME_SWITCH_SEGMENTS,
      contextGameSegments: config.TOPIC_CONTEXT_GAME_SEGMENTS,
      contextGeneralSegments: config.TOPIC_CONTEXT_GENERAL_SEGMENTS,
      contextMixedSegments: config.TOPIC_CONTEXT_MIXED_SEGMENTS,
      classifierLlmFallbackEnabled: config.TOPIC_CLASSIFIER_LLM_FALLBACK_ENABLED,
      weights: TOPIC_CLASSIFIER_CONFIG,
    },
    {
      enabled: config.SENTENCE_ASSEMBLY_ENABLED,
      holdMinMs: config.SENTENCE_HOLD_MIN_MS,
      holdDefaultMs: config.SENTENCE_HOLD_DEFAULT_MS,
      holdUncertainMs: config.SENTENCE_HOLD_UNCERTAIN_MS,
      holdStrongIncompleteMs: config.SENTENCE_HOLD_STRONG_INCOMPLETE_MS,
      holdMaxMs: config.SENTENCE_HOLD_MAX_MS,
      shortGapMs: config.SENTENCE_SHORT_GAP_MS,
      hardGapMs: config.SENTENCE_HARD_GAP_MS,
      maxSegments: config.SENTENCE_MAX_SEGMENTS,
      maxDurationMs: config.SENTENCE_MAX_DURATION_MS,
      maxWords: config.SENTENCE_MAX_WORDS,
      maxCharacters: config.SENTENCE_MAX_CHARACTERS,
      mergeScoreThreshold: config.SENTENCE_MERGE_SCORE_THRESHOLD,
      diagnosticsEnabled: config.SENTENCE_DIAGNOSTICS_ENABLED,
    },
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

  const audioBufferEstimate = estimateAudioBufferBytes({
    sampleRate: config.AUDIO_SAMPLE_RATE,
    channels: config.AUDIO_CHANNELS,
    bitsPerSample: 16,
    maxSeconds: config.AUDIO_BUFFER_MAX_SECONDS,
  });

  app.get('/api/diagnostics', async (_request, reply) => {
    if (config.NODE_ENV === 'production') {
      return reply.status(404).send({ error: 'Not found' });
    }
    const readiness = collectProductionReadinessWarnings(config);
    const sessionIds = sessions.listSessionIds();
    return {
      activeSessions: sessions.size(),
      speechProvider: config.SPEECH_PROVIDER,
      translationProvider: config.TRANSLATION_PROVIDER,
      retranscribeProvider: config.RETRANSCRIBE_PROVIDER,
      transcriptCorrectionEnabled: config.TRANSCRIPT_CORRECTION_ENABLED,
      confidenceThreshold: config.TRANSCRIPT_CONFIDENCE_THRESHOLD,
      hasOpenAiKey: Boolean(config.OPENAI_API_KEY),
      hasDeepgramKey: Boolean(config.DEEPGRAM_API_KEY),
      deepgramModel: config.DEEPGRAM_MODEL,
      // Normalization is deterministic — no provider to configure
      transcriptNormalizer: 'deterministic_profile_phonetic_aliases',
      deepgramAdapterCapabilities: {
        segmentConfidence: true,
        wordConfidence: 'parsed_when_present',
        wordTimestamps: 'parsed_when_present',
        segmentStartEndTimestamps: true,
        vocabularyOrKeytermHints: false,
      },
      audioBuffer: {
        maxSeconds: config.AUDIO_BUFFER_MAX_SECONDS,
        sampleRate: config.AUDIO_SAMPLE_RATE,
        channels: config.AUDIO_CHANNELS,
        bitsPerSample: 16,
        maxBytes: audioBufferEstimate.bytes,
        maxMib: Number(audioBufferEstimate.mib.toFixed(3)),
      },
      readinessWarnings: readiness,
      sessionIds,
      sessionMetrics: Object.fromEntries(
        sessionIds.map((id) => [id, sessions.getTranscriptMetrics(id)]),
      ),
      devAuthMode: config.DEV_AUTH_MODE,
    };
  });

  /**
   * Development-only per-segment transcript diagnostics (includes transcript text).
   * Not available in production.
   */
  app.get<{ Params: { sessionId: string } }>(
    '/api/diagnostics/transcript/:sessionId',
    async (request, reply) => {
      if (config.NODE_ENV === 'production') {
        return reply.status(404).send({ error: 'Not found' });
      }
      const session = sessions.get(request.params.sessionId);
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      return {
        sessionId: request.params.sessionId,
        metrics: session.getTranscriptMetrics(),
        segments: session.getTranscriptDiagnostics(),
      };
    },
  );

  await app.ready();
  attachRealtimeGateway(app.server, config, sessions, logger);
  logProductionReadiness(config, logger);

  return { app, logger, sessions, usage };
}
