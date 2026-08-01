import { randomUUID } from 'node:crypto';
import type { SentenceAssemblyRuntimeConfig } from './config.js';
import { combineSegmentTexts } from './fragment-merger.js';
import type {
  AssembledUtterance,
  PendingFlushReason,
  PendingUtterance,
  RawTranscriptSegment,
  TranscriptTopic,
  UtteranceCompleteness,
} from './types.js';

export class PendingUtteranceBuffer {
  private pending: PendingUtterance | null = null;
  private flushGeneration = 0;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private flushedIds = new Set<string>();

  constructor(
    private readonly config: SentenceAssemblyRuntimeConfig,
    private readonly onFlush: (utterance: AssembledUtterance) => void | Promise<void>,
    private readonly sessionId: string = 'default',
  ) {}

  get(_sessionId?: string): PendingUtterance | null {
    return this.pending;
  }

  clear(_sessionId?: string): void {
    this.cancelTimer();
    this.pending = null;
  }

  getFlushedIds(): ReadonlySet<string> {
    return this.flushedIds;
  }

  wasFlushed(id: string): boolean {
    return this.flushedIds.has(id);
  }

  createPending(input: {
    segment: RawTranscriptSegment;
    preliminaryTopic: TranscriptTopic;
    completeness: UtteranceCompleteness;
  }): PendingUtterance {
    const now = Date.now();
    const startMs = input.segment.startMs ?? now;
    const endMs = input.segment.endMs ?? startMs;
    this.pending = {
      id: randomUUID(),
      sessionId: this.sessionId,
      segments: [input.segment],
      combinedText: input.segment.text.trim(),
      startMs,
      endMs,
      createdAt: now,
      updatedAt: now,
      preliminaryTopic: input.preliminaryTopic,
      completeness: input.completeness,
      mergeCount: 0,
      holdGeneration: 0,
    };
    return this.pending;
  }

  setPending(utterance: PendingUtterance): void {
    this.pending = utterance;
  }

  cancelTimer(): void {
    if (this.timeoutHandle != null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Schedule a hold timeout. Returns the generation id used for the timer.
   */
  scheduleHold(
    waitMs: number,
    onTimeout: (generation: number) => void | Promise<void>,
  ): number {
    this.cancelTimer();
    this.flushGeneration += 1;
    const generation = this.flushGeneration;
    if (this.pending) {
      this.pending = { ...this.pending, holdGeneration: generation };
    }
    this.timeoutHandle = setTimeout(() => {
      void onTimeout(generation);
    }, waitMs);
    return generation;
  }

  isCurrentGeneration(generation: number): boolean {
    return this.pending != null && this.pending.holdGeneration === generation;
  }

  toAssembled(reason: PendingFlushReason): AssembledUtterance | null {
    if (!this.pending) return null;
    const pending = this.pending;
    const topics = pending.segments.map(() => pending.preliminaryTopic);
    // Prefer unique topics from segments if we tracked them — use pending topic for all
    const assembled: AssembledUtterance = {
      id: pending.id,
      sessionId: pending.sessionId,
      sourceSegmentIds: pending.segments.map((s) => s.segmentId),
      rawText: combineSegmentTexts(pending.segments) || pending.combinedText,
      startMs: pending.startMs,
      endMs: pending.endMs,
      preliminaryTopics: topics.length > 0 ? [pending.preliminaryTopic] : [],
      flushReason: reason,
      mergeCount: pending.mergeCount,
    };
    return assembled;
  }

  /**
   * Flush pending once. Returns assembled utterance or null if already flushed / empty.
   */
  async flush(reason: PendingFlushReason): Promise<AssembledUtterance | null> {
    this.cancelTimer();
    const assembled = this.toAssembled(reason);
    this.pending = null;
    if (!assembled) return null;
    if (this.flushedIds.has(assembled.id)) return null;
    this.flushedIds.add(assembled.id);
    await this.onFlush(assembled);
    return assembled;
  }

  /**
   * Emit an already-built assembled utterance idempotently (single-segment immediate flush).
   */
  async emitAssembled(assembled: AssembledUtterance): Promise<AssembledUtterance | null> {
    if (this.flushedIds.has(assembled.id)) return null;
    this.flushedIds.add(assembled.id);
    await this.onFlush(assembled);
    return assembled;
  }

  exceedsLimits(pending: PendingUtterance = this.pending!): PendingFlushReason | null {
    if (!pending) return null;
    if (pending.segments.length >= this.config.maxSegments) return 'maximum-segments';
    if (pending.endMs - pending.startMs >= this.config.maxDurationMs) return 'maximum-duration';
    const words = pending.combinedText.trim().split(/\s+/).filter(Boolean).length;
    if (words >= this.config.maxWords) return 'maximum-words';
    if (pending.combinedText.length >= this.config.maxCharacters) return 'maximum-characters';
    return null;
  }
}
