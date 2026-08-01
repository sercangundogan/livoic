import { describe, expect, it } from 'vitest';
import {
  SessionTranscriptDiagnostics,
  deriveCorrectionSource,
  estimateAudioBufferBytes,
  summarizeWordConfidence,
} from './session-diagnostics.js';
import { collectProductionReadinessWarnings } from './production-readiness.js';
import type { AppConfig } from '../config/index.js';
import type { QualityEvaluation } from './types.js';

describe('session diagnostics helpers', () => {
  it('summarizes word confidence when available', () => {
    const summary = summarizeWordConfidence(
      [{ confidence: 0.9 }, { confidence: 0.5 }, { confidence: 0.8 }],
      0.72,
    );
    expect(summary.available).toBe(true);
    expect(summary.wordCount).toBe(3);
    expect(summary.min).toBe(0.5);
    expect(summary.max).toBe(0.9);
    expect(summary.belowThresholdCount).toBe(1);
  });

  it('reports unavailable word confidence when missing', () => {
    expect(summarizeWordConfidence(undefined).available).toBe(false);
    expect(summarizeWordConfidence([{ word: 'a' } as { confidence?: number }]).available).toBe(
      false,
    );
  });

  it('derives correction sources', () => {
    expect(
      deriveCorrectionSource({
        retranscribed: true,
        normalized: true,
        timedOut: false,
        hasCorrected: true,
      }),
    ).toBe('retranscribe+normalize');
    expect(
      deriveCorrectionSource({
        retranscribed: false,
        normalized: true,
        timedOut: true,
        hasCorrected: true,
      }),
    ).toBe('normalize');
    expect(
      deriveCorrectionSource({
        retranscribed: false,
        normalized: false,
        timedOut: true,
        hasCorrected: false,
      }),
    ).toBe('fallback_raw');
  });

  it('estimates 45s pcm_s16le mono buffer ≈ 1.37 MiB at 16kHz', () => {
    const estimate = estimateAudioBufferBytes({
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
      maxSeconds: 45,
    });
    expect(estimate.bytes).toBe(1_440_000);
    expect(estimate.mib).toBeCloseTo(1.373, 2);
  });

  it('aggregates session metrics and warns on high retranscription rate', () => {
    const diag = new SessionTranscriptDiagnostics();
    const evaluation: QualityEvaluation = {
      score: 0.4,
      isLowConfidence: true,
      shouldRetranscribe: true,
      reasons: ['confidence_below_threshold'],
    };
    for (let i = 0; i < 5; i++) {
      diag.record(
        {
          segmentId: `s-${i}`,
          rawTranscript: 'x',
          retranscribedTranscript: 'y',
          correctedTranscript: 'y',
          translatedText: 'z',
          sttConfidence: 0.4,
          wordConfidenceSummary: { available: false, wordCount: 0 },
          qualityScore: 0.4,
          qualityReasons: evaluation.reasons,
          shouldRetranscribe: true,
          correctionSource: 'retranscribe',
          retranscribeLatencyMs: 100,
          normalizeLatencyMs: 1,
          translationLatencyMs: 50,
          totalSubtitleLatencyMs: 5000,
          timedOut: false,
          confidenceMissing: false,
        },
        evaluation,
      );
    }
    const metrics = diag.getMetrics();
    expect(metrics.totalFinalizedSegments).toBe(5);
    expect(metrics.retranscribedSegmentCount).toBe(5);
    expect(metrics.retranscriptionRate).toBe(1);
    expect(metrics.warnings.some((w) => w.startsWith('retranscription_rate_high'))).toBe(true);
    expect(metrics.warnings.some((w) => w.startsWith('low_confidence_path_latency_high'))).toBe(
      true,
    );
  });
});

describe('production readiness warnings', () => {
  const base = {
    NODE_ENV: 'production',
    PORT: 4000,
    HOST: '0.0.0.0',
    CORS_ORIGIN: '*',
    REALTIME_TOKEN_SECRET: 'production-secret-value',
    REALTIME_TOKEN_TTL_SECONDS: 300,
    DEV_AUTH_MODE: false,
    SPEECH_PROVIDER: 'deepgram',
    TRANSLATION_PROVIDER: 'openai',
    LOG_LEVEL: 'info',
    MAX_WS_PAYLOAD_BYTES: 65536,
    AUDIO_SAMPLE_RATE: 16000,
    AUDIO_CHANNELS: 1,
    CHUNK_DURATION_MS: 100,
    OPENAI_API_KEY: 'sk-test',
    DEEPGRAM_API_KEY: 'dg-test',
    DEEPGRAM_MODEL: 'nova-2',
    TRANSCRIPT_CORRECTION_ENABLED: true,
    TRANSCRIPT_CONFIDENCE_THRESHOLD: 0.72,
    RETRANSCRIBE_TIMEOUT_MS: 2500,
    AUDIO_BUFFER_MAX_SECONDS: 45,
    RETRANSCRIBE_PROVIDER: 'openai',
  } as AppConfig;

  it('flags mock retranscribe provider in production', () => {
    const warnings = collectProductionReadinessWarnings({
      ...base,
      RETRANSCRIBE_PROVIDER: 'mock',
    });
    expect(warnings.some((w) => w.code === 'mock_retranscribe_provider')).toBe(true);
  });

  it('passes when real providers are configured', () => {
    const warnings = collectProductionReadinessWarnings(base);
    expect(warnings.filter((w) => w.severity === 'error')).toHaveLength(0);
  });
});
