import { randomUUID } from 'node:crypto';
import type { SpeechSessionOptions, SpeechToTextProvider, TranscriptEvent } from './speech-provider.js';

const SAMPLE_SEGMENTS = [
  "We're starting the new map now.",
  'Bro, this build is actually cracked.',
  'Watch out for the flank on the left.',
  'Okay team, push mid with me.',
  'That was a clean play, nice job.',
  'I need to buy armor before the next round.',
  "He's one HP, finish him.",
  "We're going into the boss fight now.",
];

/**
 * Deterministic mock STT provider for local development.
 * Emits partial → final transcript events based on received audio volume over time.
 */
export class MockSpeechProvider implements SpeechToTextProvider {
  private partialCb?: (event: TranscriptEvent) => void;
  private finalCb?: (event: TranscriptEvent) => void;
  private errorCb?: (error: Error) => void;
  private timer?: ReturnType<typeof setInterval>;
  private audioBytes = 0;
  private segmentIndex = 0;
  private startedAt = 0;
  private closed = false;
  private options?: SpeechSessionOptions;

  async connect(options: SpeechSessionOptions): Promise<void> {
    this.options = options;
    this.startedAt = Date.now();
    this.closed = false;
    this.timer = setInterval(() => this.emitNext(), 2800);
  }

  sendAudio(chunk: Buffer): void {
    if (this.closed) return;
    this.audioBytes += chunk.length;
  }

  onPartial(callback: (event: TranscriptEvent) => void): void {
    this.partialCb = callback;
  }

  onFinal(callback: (event: TranscriptEvent) => void): void {
    this.finalCb = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCb = callback;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private emitNext(): void {
    if (this.closed || this.audioBytes < 3200) return;

    const text = SAMPLE_SEGMENTS[this.segmentIndex % SAMPLE_SEGMENTS.length]!;
    const segmentId = `seg-${this.options?.sessionId.slice(0, 8)}-${this.segmentIndex}`;
    const elapsed = Date.now() - this.startedAt;
    const words = text.split(' ');

    // Emit a partial with first half of words
    const partialText = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    this.partialCb?.({
      segmentId,
      text: partialText,
      isFinal: false,
      language: 'en',
      startMs: elapsed,
    });

    setTimeout(() => {
      if (this.closed) return;
      this.finalCb?.({
        segmentId,
        text,
        isFinal: true,
        language: 'en',
        startMs: elapsed,
        endMs: elapsed + 2200,
      });
    }, 600);

    this.segmentIndex += 1;
    // Soft-reset so we need more audio before next emission
    this.audioBytes = Math.floor(this.audioBytes * 0.2);
  }
}

export function createSpeechProvider(name: string): SpeechToTextProvider {
  if (name === 'openai' || name === 'deepgram') {
    // Real streaming adapters live under ./providers — fall back to mock until keys are configured.
    void randomUUID();
  }
  return new MockSpeechProvider();
}
