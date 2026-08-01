import type { SpeechSessionOptions, SpeechToTextProvider, TranscriptEvent } from '../speech-provider.js';

/**
 * OpenAI Whisper via chunked REST uploads.
 * Higher latency than Deepgram streaming, but works with only an OPENAI_API_KEY.
 */
export class OpenAiWhisperSpeechProvider implements SpeechToTextProvider {
  private partialCb?: (event: TranscriptEvent) => void;
  private finalCb?: (event: TranscriptEvent) => void;
  private errorCb?: (error: Error) => void;
  private options?: SpeechSessionOptions;
  private closed = false;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private segmentIndex = 0;
  private flushing = false;
  private readonly targetBytes: number;

  constructor(
    private readonly apiKey: string,
    private readonly model = 'whisper-1',
    /** ~2.5s of 16kHz mono pcm_s16le */
    chunkSeconds = 2.5,
  ) {
    this.targetBytes = Math.floor(16_000 * 2 * chunkSeconds);
  }

  async connect(options: SpeechSessionOptions): Promise<void> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for openai speech provider');
    }
    this.options = options;
    this.closed = false;
    this.segmentIndex = 0;
    this.pending = [];
    this.pendingBytes = 0;
  }

  sendAudio(chunk: Buffer): void {
    if (this.closed) return;
    this.pending.push(chunk);
    this.pendingBytes += chunk.length;
    if (this.pendingBytes >= this.targetBytes) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
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
    if (this.flushTimer) clearTimeout(this.flushTimer);
    await this.flush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, 3_000);
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.pendingBytes < 3200) return;
    this.flushing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    const pcm = Buffer.concat(this.pending);
    this.pending = [];
    this.pendingBytes = 0;

    const sampleRate = this.options?.sampleRate ?? 16_000;
    const wav = pcmToWav(pcm, sampleRate);
    const segmentId = `oai-${this.options?.sessionId.slice(0, 8)}-${this.segmentIndex}`;

    try {
      this.partialCb?.({
        segmentId,
        text: '…',
        isFinal: false,
      });

      const form = new FormData();
      form.append('file', new Blob([wav], { type: 'audio/wav' }), 'chunk.wav');
      form.append('model', this.model);
      form.append('response_format', 'json');
      if (this.options?.sourceLanguage && this.options.sourceLanguage !== 'auto') {
        form.append('language', this.options.sourceLanguage);
      }

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
        },
        body: form,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI Whisper failed: ${response.status} ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as { text?: string };
      const text = data.text?.trim();
      if (text) {
        this.finalCb?.({
          segmentId,
          text,
          isFinal: true,
        });
        this.segmentIndex += 1;
      }
    } catch (error) {
      this.errorCb?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.flushing = false;
    }
  }
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function createOpenAiSpeechProvider(apiKey: string): SpeechToTextProvider {
  return new OpenAiWhisperSpeechProvider(apiKey);
}
