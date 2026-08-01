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
  /** Absolute stream timeline from first audio byte (aligned with AudioRingBuffer). */
  private streamBytesTotal = 0;
  private segmentIndex = 0;
  private closed = false;
  private options?: SpeechSessionOptions;

  async connect(options: SpeechSessionOptions): Promise<void> {
    this.options = options;
    this.closed = false;
    this.streamBytesTotal = 0;
    this.audioBytes = 0;
    this.timer = setInterval(() => this.emitNext(), 2800);
  }

  sendAudio(chunk: Buffer): void {
    if (this.closed) return;
    this.audioBytes += chunk.length;
    this.streamBytesTotal += chunk.length;
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
    const sampleRate = this.options?.sampleRate ?? 16_000;
    const endMs = Math.floor((this.streamBytesTotal / (sampleRate * 2)) * 1000);
    const startMs = Math.max(0, endMs - 2200);
    const words = text.split(' ');

    const partialText = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    this.partialCb?.({
      segmentId,
      text: partialText,
      isFinal: false,
      language: 'en',
      confidence: 0.95,
      startMs,
    });

    setTimeout(() => {
      if (this.closed) return;
      this.finalCb?.({
        segmentId,
        text,
        isFinal: true,
        language: 'en',
        confidence: 0.95,
        startMs,
        endMs,
      });
    }, 600);

    this.segmentIndex += 1;
    this.audioBytes = Math.floor(this.audioBytes * 0.2);
  }
}
