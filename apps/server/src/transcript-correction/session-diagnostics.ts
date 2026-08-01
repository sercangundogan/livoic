import type { QualityEvaluation } from './types.js';

export type CorrectionSource =
  | 'none'
  | 'retranscribe'
  | 'normalize'
  | 'retranscribe+normalize'
  | 'fallback_raw';

export type WordConfidenceSummary = {
  available: boolean;
  wordCount: number;
  min?: number;
  max?: number;
  avg?: number;
  belowThresholdCount?: number;
};

/** Per-finalized-segment diagnostics — development only; may include transcript text. */
export type SegmentTranscriptDiagnostics = {
  segmentId: string;
  rawTranscript: string;
  retranscribedTranscript?: string;
  correctedTranscript?: string;
  translatedText?: string;
  sttConfidence?: number;
  wordConfidenceSummary: WordConfidenceSummary;
  qualityScore: number;
  qualityReasons: string[];
  shouldRetranscribe: boolean;
  correctionSource: CorrectionSource;
  retranscribeLatencyMs: number;
  normalizeLatencyMs: number;
  translationLatencyMs: number;
  totalSubtitleLatencyMs: number;
  timedOut: boolean;
  confidenceMissing: boolean;
  /** Topic routing (when enabled). */
  topic?: 'game' | 'general' | 'uncertain';
  topicConfidence?: number;
  gameScore?: number;
  generalScore?: number;
  topicReasons?: string[];
  matchedGameTerms?: string[];
  matchedGeneralSignals?: string[];
  activeTopic?: 'game' | 'general' | 'uncertain';
  route?: 'game-aware' | 'general' | 'conservative';
  gameContextAttached?: boolean;
  classificationLatencyMs?: number;
  /** Sentence assembly (when enabled). */
  assemblyId?: string;
  assemblySourceSegmentCount?: number;
  assemblyMergeCount?: number;
  assemblyMerged?: boolean;
  assemblyFlushReason?: string;
};

export type SessionTranscriptMetrics = {
  totalFinalizedSegments: number;
  retranscribedSegmentCount: number;
  retranscriptionRate: number;
  correctionCount: number;
  correctionFallbackCount: number;
  retranscriptionTimeoutCount: number;
  averageNormalPathLatencyMs: number;
  averageLowConfidencePathLatencyMs: number;
  missingConfidenceSegmentCount: number;
  gameSegmentCount: number;
  generalSegmentCount: number;
  uncertainSegmentCount: number;
  routeSwitchCount: number;
  generalToGameSwitchCount: number;
  gameToGeneralSwitchCount: number;
  generalRouteGameContextLeakageCount: number;
  warnings: string[];
};

const RETRANSCRIBE_RATE_WARN = 0.4;
const LOW_CONF_LATENCY_WARN_MS = 4_000;

export function summarizeWordConfidence(
  words: Array<{ confidence?: number }> | undefined,
  threshold = 0.72,
): WordConfidenceSummary {
  if (!words?.length) {
    return { available: false, wordCount: 0 };
  }
  const confidences = words
    .map((w) => w.confidence)
    .filter((c): c is number => typeof c === 'number');
  if (confidences.length === 0) {
    return { available: false, wordCount: words.length };
  }
  const min = Math.min(...confidences);
  const max = Math.max(...confidences);
  const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const belowThresholdCount = confidences.filter((c) => c < threshold).length;
  return {
    available: true,
    wordCount: words.length,
    min,
    max,
    avg,
    belowThresholdCount,
  };
}

export function deriveCorrectionSource(input: {
  retranscribed: boolean;
  normalized: boolean;
  timedOut: boolean;
  hasCorrected: boolean;
}): CorrectionSource {
  if (input.timedOut && !input.retranscribed) {
    return input.normalized ? 'normalize' : 'fallback_raw';
  }
  if (input.retranscribed && input.normalized) return 'retranscribe+normalize';
  if (input.retranscribed) return 'retranscribe';
  if (input.normalized || input.hasCorrected) return 'normalize';
  return 'none';
}

export class SessionTranscriptDiagnostics {
  private readonly segments: SegmentTranscriptDiagnostics[] = [];
  private normalPathLatencies: number[] = [];
  private lowConfPathLatencies: number[] = [];
  private retranscribedCount = 0;
  private correctionCount = 0;
  private fallbackCount = 0;
  private timeoutCount = 0;
  private missingConfidenceCount = 0;

  record(segment: SegmentTranscriptDiagnostics, evaluation: QualityEvaluation): void {
    this.segments.push(segment);
    if (segment.confidenceMissing) this.missingConfidenceCount += 1;
    if (segment.retranscribedTranscript !== undefined || segment.shouldRetranscribe) {
      // count actual retranscriptions separately
    }
    if (segment.correctionSource === 'retranscribe' || segment.correctionSource === 'retranscribe+normalize') {
      this.retranscribedCount += 1;
    }
    if (segment.correctedTranscript) this.correctionCount += 1;
    if (segment.correctionSource === 'fallback_raw' || segment.timedOut) {
      if (segment.timedOut) this.timeoutCount += 1;
      if (segment.correctionSource === 'fallback_raw') this.fallbackCount += 1;
    }
    if (evaluation.shouldRetranscribe || evaluation.isLowConfidence) {
      this.lowConfPathLatencies.push(segment.totalSubtitleLatencyMs);
    } else {
      this.normalPathLatencies.push(segment.totalSubtitleLatencyMs);
    }
  }

  /** Mark that Whisper re-transcription actually ran successfully (distinct from shouldRetranscribe). */
  noteRetranscribedSuccess(): void {
    // handled via correctionSource in record(); kept for clarity in callers
  }

  getSegments(): SegmentTranscriptDiagnostics[] {
    return [...this.segments];
  }

  getMetrics(): SessionTranscriptMetrics {
    const total = this.segments.length;
    const retranscribedSegmentCount = this.segments.filter(
      (s) =>
        s.correctionSource === 'retranscribe' || s.correctionSource === 'retranscribe+normalize',
    ).length;
    const correctionCount = this.segments.filter((s) => Boolean(s.correctedTranscript)).length;
    const correctionFallbackCount = this.segments.filter(
      (s) => s.timedOut || s.correctionSource === 'fallback_raw',
    ).length;
    const retranscriptionTimeoutCount = this.segments.filter((s) => s.timedOut).length;
    const retranscriptionRate = total > 0 ? retranscribedSegmentCount / total : 0;
    const averageNormalPathLatencyMs = average(this.normalPathLatencies);
    const averageLowConfidencePathLatencyMs = average(this.lowConfPathLatencies);

    const warnings: string[] = [];
    if (total >= 5 && retranscriptionRate > RETRANSCRIBE_RATE_WARN) {
      warnings.push(
        `retranscription_rate_high:${(retranscriptionRate * 100).toFixed(1)}%_gt_40%`,
      );
    }
    if (
      this.lowConfPathLatencies.length >= 3 &&
      averageLowConfidencePathLatencyMs > LOW_CONF_LATENCY_WARN_MS
    ) {
      warnings.push(
        `low_confidence_path_latency_high:${Math.round(averageLowConfidencePathLatencyMs)}ms_gt_4000ms`,
      );
    }
    if (total >= 5 && this.missingConfidenceCount / total > 0.5) {
      warnings.push('stt_confidence_frequently_missing');
    }

    const gameSegmentCount = this.segments.filter((s) => s.topic === 'game').length;
    const generalSegmentCount = this.segments.filter((s) => s.topic === 'general').length;
    const uncertainSegmentCount = this.segments.filter((s) => s.topic === 'uncertain').length;

    let routeSwitchCount = 0;
    let generalToGameSwitchCount = 0;
    let gameToGeneralSwitchCount = 0;
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1]?.route;
      const curr = this.segments[i]?.route;
      if (!prev || !curr || prev === curr) continue;
      routeSwitchCount += 1;
      if (prev === 'general' && (curr === 'game-aware' || curr === 'conservative')) {
        generalToGameSwitchCount += 1;
      }
      if ((prev === 'game-aware' || prev === 'conservative') && curr === 'general') {
        gameToGeneralSwitchCount += 1;
      }
    }
    const generalRouteGameContextLeakageCount = this.segments.filter(
      (s) => s.route === 'general' && s.gameContextAttached === true,
    ).length;

    return {
      totalFinalizedSegments: total,
      retranscribedSegmentCount,
      retranscriptionRate,
      correctionCount,
      correctionFallbackCount,
      retranscriptionTimeoutCount,
      averageNormalPathLatencyMs,
      averageLowConfidencePathLatencyMs,
      missingConfidenceSegmentCount: this.missingConfidenceCount,
      gameSegmentCount,
      generalSegmentCount,
      uncertainSegmentCount,
      routeSwitchCount,
      generalToGameSwitchCount,
      gameToGeneralSwitchCount,
      generalRouteGameContextLeakageCount,
      warnings,
    };
  }

  clear(): void {
    this.segments.length = 0;
    this.normalPathLatencies = [];
    this.lowConfPathLatencies = [];
    this.retranscribedCount = 0;
    this.correctionCount = 0;
    this.fallbackCount = 0;
    this.timeoutCount = 0;
    this.missingConfidenceCount = 0;
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Approximate max PCM buffer bytes for a session ring buffer. */
export function estimateAudioBufferBytes(input: {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  maxSeconds: number;
}): { bytes: number; kib: number; mib: number } {
  const bytesPerSample = input.bitsPerSample / 8;
  const bytes = Math.floor(
    input.sampleRate * input.channels * bytesPerSample * input.maxSeconds,
  );
  return {
    bytes,
    kib: bytes / 1024,
    mib: bytes / (1024 * 1024),
  };
}
