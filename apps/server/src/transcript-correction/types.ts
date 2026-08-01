import type { GameTranslationProfile } from '../game-context/types.js';
import type { AudioRingBuffer } from './audio-ring-buffer.js';
import type { Retranscriber } from './retranscriber.js';

export type QualityEvaluation = {
  score: number;
  isLowConfidence: boolean;
  shouldRetranscribe: boolean;
  reasons: string[];
};

export type StoredTranscriptSegment = {
  segmentId: string;
  rawText: string;
  correctedText?: string;
  confidence?: number;
  textForTranslation: string;
  retranscribed: boolean;
  normalized: boolean;
  timedOut: boolean;
  reasons: string[];
};

export type CorrectionResult = {
  rawText: string;
  /** Whisper (or mock) output before normalization, when re-transcription ran. */
  retranscribedText?: string;
  correctedText?: string;
  textForTranslation: string;
  evaluation: QualityEvaluation;
  retranscribed: boolean;
  normalized: boolean;
  timedOut: boolean;
  retranscribeLatencyMs: number;
  normalizeLatencyMs: number;
  correctionSource: import('./session-diagnostics.js').CorrectionSource;
};

export type TranscriptCorrectionConfig = {
  enabled: boolean;
  confidenceThreshold: number;
  retranscribeTimeoutMs: number;
  audioBufferMaxSeconds: number;
  retranscribeProvider: 'mock' | 'openai' | 'none';
};

export type CorrectFinalSegmentInput = {
  segmentId: string;
  rawText: string;
  confidence?: number;
  startMs?: number;
  endMs?: number;
  language?: string;
  profile?: GameTranslationProfile;
  sampleRate: number;
  audioBuffer: AudioRingBuffer;
  retranscriber: Retranscriber;
  confidenceThreshold: number;
  retranscribeTimeoutMs: number;
  enabled: boolean;
  /**
   * When true, skip game phonetic normalization so the caller can apply
   * route-specific normalization after topic classification.
   */
  skipPhoneticNormalization?: boolean;
};

export type PhoneticAlias = NonNullable<GameTranslationProfile['phoneticAliases']>[number];
