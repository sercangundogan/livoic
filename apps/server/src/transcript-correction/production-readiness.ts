import type { AppConfig } from '../config/index.js';
import type { Logger } from '../observability/logger.js';
import { estimateAudioBufferBytes } from './session-diagnostics.js';

export type ProductionReadinessWarning = {
  code: string;
  severity: 'warn' | 'error';
  message: string;
};

/**
 * Startup / readiness checks for the real transcript-correction path.
 * Does not throw — callers log warnings. Fatal misconfig for production is severity error.
 */
export function collectProductionReadinessWarnings(
  config: AppConfig,
): ProductionReadinessWarning[] {
  const warnings: ProductionReadinessWarning[] = [];
  const isProd = config.NODE_ENV === 'production';

  if (config.SPEECH_PROVIDER === 'mock' && (isProd || config.TRANSCRIPT_CORRECTION_ENABLED)) {
    warnings.push({
      code: 'mock_streaming_stt',
      severity: isProd ? 'error' : 'warn',
      message:
        'SPEECH_PROVIDER=mock — streaming STT will not produce real speech transcripts. Use deepgram for production.',
    });
  }

  if (config.TRANSLATION_PROVIDER === 'mock' && isProd) {
    warnings.push({
      code: 'mock_translation',
      severity: 'error',
      message: 'TRANSLATION_PROVIDER=mock in production — set TRANSLATION_PROVIDER=openai.',
    });
  }

  if (
    config.TRANSCRIPT_CORRECTION_ENABLED &&
    config.RETRANSCRIBE_PROVIDER === 'mock' &&
    (isProd || config.SPEECH_PROVIDER === 'deepgram')
  ) {
    warnings.push({
      code: 'mock_retranscribe_provider',
      severity: isProd ? 'error' : 'warn',
      message:
        'RETRANSCRIBE_PROVIDER=mock — selective Whisper re-transcription is not real. Set RETRANSCRIBE_PROVIDER=openai with OPENAI_API_KEY.',
    });
  }

  if (config.RETRANSCRIBE_PROVIDER === 'openai' && !config.OPENAI_API_KEY) {
    warnings.push({
      code: 'missing_openai_key_for_retranscribe',
      severity: isProd ? 'error' : 'warn',
      message: 'RETRANSCRIBE_PROVIDER=openai requires OPENAI_API_KEY.',
    });
  }

  if (config.SPEECH_PROVIDER === 'deepgram' && !config.DEEPGRAM_API_KEY) {
    warnings.push({
      code: 'missing_deepgram_key',
      severity: isProd ? 'error' : 'warn',
      message: 'SPEECH_PROVIDER=deepgram requires DEEPGRAM_API_KEY.',
    });
  }

  if (config.TRANSLATION_PROVIDER === 'openai' && !config.OPENAI_API_KEY) {
    warnings.push({
      code: 'missing_openai_key_for_translation',
      severity: isProd ? 'error' : 'warn',
      message: 'TRANSLATION_PROVIDER=openai requires OPENAI_API_KEY.',
    });
  }

  if (isProd && config.DEV_AUTH_MODE) {
    warnings.push({
      code: 'dev_auth_in_production',
      severity: 'error',
      message: 'DEV_AUTH_MODE must be false in production.',
    });
  }

  return warnings;
}

export function logProductionReadiness(config: AppConfig, logger: Logger): void {
  const warnings = collectProductionReadinessWarnings(config);
  const buffer = estimateAudioBufferBytes({
    sampleRate: config.AUDIO_SAMPLE_RATE,
    channels: config.AUDIO_CHANNELS,
    bitsPerSample: 16,
    maxSeconds: config.AUDIO_BUFFER_MAX_SECONDS,
  });

  logger.info('transcript_correction_readiness', {
    speechProvider: config.SPEECH_PROVIDER,
    translationProvider: config.TRANSLATION_PROVIDER,
    retranscribeProvider: config.RETRANSCRIBE_PROVIDER,
    correctionEnabled: config.TRANSCRIPT_CORRECTION_ENABLED,
    confidenceThreshold: config.TRANSCRIPT_CONFIDENCE_THRESHOLD,
    audioBufferMaxBytes: buffer.bytes,
    audioBufferMaxMib: Number(buffer.mib.toFixed(3)),
    // Normalization has no provider — always local
    normalizer: 'deterministic_profile_phonetic_aliases',
  });

  for (const warning of warnings) {
    if (warning.severity === 'error') {
      logger.error('production_readiness_check', {
        code: warning.code,
        message: warning.message,
      });
    } else {
      logger.warn('production_readiness_check', {
        code: warning.code,
        message: warning.message,
      });
    }
  }
}
