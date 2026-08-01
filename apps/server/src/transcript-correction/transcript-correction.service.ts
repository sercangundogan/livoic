import { evaluateQuality } from './quality-evaluator.js';
import { normalizeTranscript } from './transcript-normalizer.js';
import { deriveCorrectionSource } from './session-diagnostics.js';
import type { TranscriptStore } from './transcript-store.js';
import type { CorrectFinalSegmentInput, CorrectionResult } from './types.js';

const AUDIO_PAD_MS = 200;

export class TranscriptCorrectionService {
  constructor(private readonly store: TranscriptStore) {}

  async correctFinalSegment(input: CorrectFinalSegmentInput): Promise<CorrectionResult> {
    const rawText = input.rawText.trim();

    if (!input.enabled) {
      const evaluation = evaluateQuality({
        text: rawText,
        confidence: input.confidence,
        threshold: input.confidenceThreshold,
        profile: input.profile,
      });
      this.store.remember({
        segmentId: input.segmentId,
        rawText,
        correctedText: undefined,
        confidence: input.confidence,
        textForTranslation: rawText,
        retranscribed: false,
        normalized: false,
        timedOut: false,
        reasons: ['correction_disabled', ...evaluation.reasons],
      });
      return {
        rawText,
        correctedText: undefined,
        textForTranslation: rawText,
        evaluation,
        retranscribed: false,
        normalized: false,
        timedOut: false,
        retranscribeLatencyMs: 0,
        normalizeLatencyMs: 0,
        correctionSource: 'none',
      };
    }

    const evaluation = evaluateQuality({
      text: rawText,
      confidence: input.confidence,
      threshold: input.confidenceThreshold,
      profile: input.profile,
    });

    let candidate = rawText;
    let retranscribedText: string | undefined;
    let retranscribed = false;
    let timedOut = false;
    let retranscribeLatencyMs = 0;

    if (evaluation.shouldRetranscribe) {
      const startMs = input.startMs ?? 0;
      const endMs = input.endMs ?? startMs;
      const pcm =
        endMs > startMs
          ? input.audioBuffer.extract(startMs, endMs, AUDIO_PAD_MS)
          : Buffer.alloc(0);

      if (pcm.length > 0) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), input.retranscribeTimeoutMs);
        const retranscribeStarted = Date.now();
        try {
          const result = await Promise.race([
            input.retranscriber.transcribe(pcm, {
              language: input.language,
              sampleRate: input.sampleRate,
              signal: controller.signal,
            }),
            new Promise<null>((resolve) => {
              controller.signal.addEventListener('abort', () => resolve(null), { once: true });
            }),
          ]);

          retranscribeLatencyMs = Date.now() - retranscribeStarted;

          if (result && result.trim()) {
            candidate = result.trim();
            retranscribedText = candidate;
            retranscribed = true;
          } else if (controller.signal.aborted) {
            timedOut = true;
            candidate = rawText;
          }
        } catch {
          retranscribeLatencyMs = Date.now() - retranscribeStarted;
          if (controller.signal.aborted) timedOut = true;
          candidate = rawText;
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    const normalizeStarted = Date.now();
    const normalized = normalizeTranscript(candidate, input.profile);
    const normalizeLatencyMs = Date.now() - normalizeStarted;
    const normalizedText = normalized.text;
    const didNormalize = normalized.appliedAliases.length > 0 || normalizedText !== candidate;

    const retranscribedDifferent =
      retranscribed && candidate.length > 0 && candidate !== rawText;
    const normalizedDifferent = normalizedText !== rawText;
    const hasValidCorrected = normalizedDifferent || retranscribedDifferent;

    const correctedText = hasValidCorrected ? normalizedText : undefined;
    const textForTranslation = correctedText ?? rawText;
    const correctionSource = deriveCorrectionSource({
      retranscribed,
      normalized: didNormalize || normalized.appliedAliases.length > 0,
      timedOut,
      hasCorrected: Boolean(correctedText),
    });

    this.store.remember({
      segmentId: input.segmentId,
      rawText,
      correctedText,
      confidence: input.confidence,
      textForTranslation,
      retranscribed,
      normalized: didNormalize || normalized.appliedAliases.length > 0,
      timedOut,
      reasons: [
        ...evaluation.reasons,
        ...(timedOut ? ['retranscribe_timeout'] : []),
        ...normalized.appliedAliases.map((a) => `alias:${a}`),
      ],
    });

    return {
      rawText,
      retranscribedText,
      correctedText,
      textForTranslation,
      evaluation,
      retranscribed,
      normalized: didNormalize || normalized.appliedAliases.length > 0,
      timedOut,
      retranscribeLatencyMs,
      normalizeLatencyMs,
      correctionSource,
    };
  }
}
