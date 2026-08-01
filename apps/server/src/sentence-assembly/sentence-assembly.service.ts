import { randomUUID } from 'node:crypto';
import type { SentenceAssemblyRuntimeConfig } from './config.js';
import { SentenceCompletenessEvaluator } from './completeness-evaluator.js';
import { FragmentMerger } from './fragment-merger.js';
import { isFillerOnly } from './merge-policy.js';
import { PendingUtteranceBuffer } from './pending-utterance-buffer.js';
import type {
  AssembledUtterance,
  FragmentMergeDecision,
  HandleFinalSegmentResult,
  PendingFlushReason,
  RawTranscriptSegment,
  TranscriptTopic,
} from './types.js';

export type SentenceAssemblyServiceOptions = {
  sessionId?: string;
  evaluator?: SentenceCompletenessEvaluator;
  merger?: FragmentMerger;
};

export class SentenceAssemblyService {
  private readonly buffer: PendingUtteranceBuffer;
  private readonly evaluator: SentenceCompletenessEvaluator;
  private readonly merger: FragmentMerger;
  private readonly sessionId: string;

  constructor(
    private readonly config: SentenceAssemblyRuntimeConfig,
    private readonly onAssembled: (utterance: AssembledUtterance) => void | Promise<void>,
    options: SentenceAssemblyServiceOptions = {},
  ) {
    this.sessionId = options.sessionId ?? 'default';
    this.evaluator =
      options.evaluator ??
      new SentenceCompletenessEvaluator({
        holdMinMs: config.holdMinMs,
        holdDefaultMs: config.holdDefaultMs,
        holdUncertainMs: config.holdUncertainMs,
        holdStrongIncompleteMs: config.holdStrongIncompleteMs,
        holdMaxMs: config.holdMaxMs,
      });
    this.merger = options.merger ?? new FragmentMerger();
    this.buffer = new PendingUtteranceBuffer(config, onAssembled, this.sessionId);
  }

  getPending() {
    return this.buffer.get();
  }

  /**
   * Handle a final STT segment with preliminary topic.
   * If held, schedules timeout. If flushed now, calls onAssembled (awaited).
   */
  async handleFinalSegment(input: {
    segment: RawTranscriptSegment;
    preliminaryTopic: TranscriptTopic;
  }): Promise<HandleFinalSegmentResult> {
    const { segment, preliminaryTopic } = input;

    if (!this.config.enabled) {
      const assembled = this.buildSingleAssembled(segment, preliminaryTopic, 'disabled');
      const emitted = await this.buffer.emitAssembled(assembled);
      return { action: emitted ? 'flushed' : 'discarded', assembled: emitted ?? undefined };
    }

    const text = segment.text.trim();
    if (!text) {
      return { action: 'discarded' };
    }

    const pending = this.buffer.get();

    // Filler-only with no pending → discard
    if (isFillerOnly(text) && !pending) {
      return { action: 'discarded' };
    }

    if (pending) {
      const gapMs = this.computeGapMs(pending.endMs, segment.startMs);
      const merge = this.merger.shouldMerge({
        pending,
        next: segment,
        nextTopic: preliminaryTopic,
        gapMs,
        mergeThreshold: this.config.mergeScoreThreshold,
        shortGapMs: this.config.shortGapMs,
        hardGapMs: this.config.hardGapMs,
      });

      if (merge.shouldMerge) {
        return this.handleMerge(pending, segment, preliminaryTopic, merge);
      }

      // Not merging: flush pending first, then process current as new
      const flushed = await this.buffer.flush(this.flushReasonFromMerge(merge));
      const nextResult = await this.processAsNew(segment, preliminaryTopic);
      if (flushed && nextResult.action === 'flushed') {
        return {
          action: 'flushed',
          assembled: nextResult.assembled,
          completeness: nextResult.completeness,
          merge,
        };
      }
      if (flushed && nextResult.action === 'held') {
        return {
          action: 'held',
          assembled: flushed,
          completeness: nextResult.completeness,
          merge,
        };
      }
      if (flushed && nextResult.action === 'discarded') {
        return { action: 'flushed', assembled: flushed, merge };
      }
      return { ...nextResult, merge };
    }

    return this.processAsNew(segment, preliminaryTopic);
  }

  /** Force flush pending (session stop / game change). */
  async flush(reason: PendingFlushReason): Promise<AssembledUtterance | null> {
    return this.buffer.flush(reason);
  }

  /** Cancel timers and drop pending without flush. */
  clear(): void {
    this.buffer.clear();
  }

  /** Flush pending if present, then clear timers/state. */
  async flushThenClear(reason: PendingFlushReason): Promise<AssembledUtterance | null> {
    const assembled = await this.buffer.flush(reason);
    this.buffer.clear();
    return assembled;
  }

  private async handleMerge(
    pending: ReturnType<PendingUtteranceBuffer['get']> & object,
    segment: RawTranscriptSegment,
    preliminaryTopic: TranscriptTopic,
    merge: FragmentMergeDecision,
  ): Promise<HandleFinalSegmentResult> {
    let merged = this.merger.merge(pending, segment);
    // Inherit / update topic: prefer non-uncertain
    if (preliminaryTopic !== 'uncertain') {
      merged = { ...merged, preliminaryTopic };
    }

    const completeness = this.evaluator.evaluate({
      segment,
      text: merged.combinedText,
      previousPending: merged,
      preliminaryTopic: merged.preliminaryTopic,
      recentSegments: [],
    });
    merged = { ...merged, completeness: completeness.completeness };
    this.buffer.setPending(merged);

    const limitReason = this.buffer.exceedsLimits(merged);
    if (limitReason) {
      const assembled = await this.buffer.flush(limitReason);
      return {
        action: assembled ? 'flushed' : 'discarded',
        assembled: assembled ?? undefined,
        completeness,
        merge,
      };
    }

    if (!completeness.shouldHold || completeness.completeness === 'complete') {
      const assembled = await this.buffer.flush('sentence-complete');
      return {
        action: assembled ? 'flushed' : 'discarded',
        assembled: assembled ?? undefined,
        completeness,
        merge,
      };
    }

    this.scheduleHold(completeness.recommendedWaitMs);
    return { action: 'held', completeness, merge };
  }

  private async processAsNew(
    segment: RawTranscriptSegment,
    preliminaryTopic: TranscriptTopic,
  ): Promise<HandleFinalSegmentResult> {
    if (isFillerOnly(segment.text)) {
      return { action: 'discarded' };
    }

    const completeness = this.evaluator.evaluate({
      segment,
      text: segment.text,
      preliminaryTopic,
      recentSegments: [],
    });

    if (!completeness.shouldHold || completeness.completeness === 'complete') {
      const assembled = this.buildSingleAssembled(
        segment,
        preliminaryTopic,
        'sentence-complete',
      );
      const emitted = await this.buffer.emitAssembled(assembled);
      return {
        action: emitted ? 'flushed' : 'discarded',
        assembled: emitted ?? undefined,
        completeness,
      };
    }

    this.buffer.createPending({
      segment,
      preliminaryTopic,
      completeness: completeness.completeness,
    });
    this.scheduleHold(completeness.recommendedWaitMs);
    return { action: 'held', completeness };
  }

  private scheduleHold(waitMs: number): void {
    this.buffer.scheduleHold(waitMs, async (generation) => {
      if (!this.buffer.isCurrentGeneration(generation)) return;
      await this.buffer.flush('timeout');
    });
  }

  private computeGapMs(previousEndMs: number, currentStartMs?: number): number {
    if (currentStartMs == null) return 0;
    return Math.max(0, currentStartMs - previousEndMs);
  }

  private flushReasonFromMerge(merge: FragmentMergeDecision): PendingFlushReason {
    if (merge.reasons.includes('topic-conflict')) return 'topic-change';
    if (merge.reasons.includes('restart-marker')) return 'restart';
    if (merge.reasons.includes('discourse-reset')) return 'discourse-reset';
    return 'sentence-complete';
  }

  private buildSingleAssembled(
    segment: RawTranscriptSegment,
    topic: TranscriptTopic,
    reason: PendingFlushReason,
  ): AssembledUtterance {
    const now = Date.now();
    return {
      id: randomUUID(),
      sessionId: this.sessionId,
      sourceSegmentIds: [segment.segmentId],
      rawText: segment.text.trim(),
      startMs: segment.startMs ?? now,
      endMs: segment.endMs ?? segment.startMs ?? now,
      preliminaryTopics: [topic],
      flushReason: reason,
      mergeCount: 0,
    };
  }
}
