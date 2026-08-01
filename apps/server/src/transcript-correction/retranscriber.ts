export type RetranscribeOptions = {
  language?: string;
  sampleRate: number;
  signal?: AbortSignal;
};

export interface Retranscriber {
  transcribe(pcm: Buffer, opts: RetranscribeOptions): Promise<string | null>;
}

/** Build a minimal WAV (pcm_s16le mono) header + payload. */
export function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * Test / local mock retranscriber.
 * - `map`: known raw→corrected when `pendingRaw` is set, or single-entry auto map
 * - `fixedResult`: always return this string (or null)
 * - `delayMs`: simulate slow Whisper for timeout tests
 * - `echo`: return a non-null placeholder based on pcm length
 */
export class MockRetranscriber implements Retranscriber {
  calls = 0;
  lastPcm?: Buffer;
  pendingRaw?: string;
  fixedResult?: string | null;
  delayMs = 0;
  echo = false;

  constructor(private readonly map: Record<string, string> = {}) {}

  async transcribe(pcm: Buffer, opts: RetranscribeOptions): Promise<string | null> {
    this.calls += 1;
    this.lastPcm = pcm;

    if (pcm.length === 0) return null;

    if (this.delayMs > 0) {
      const delayed = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(true), this.delayMs);
        const onAbort = () => {
          clearTimeout(timer);
          resolve(false);
        };
        if (opts.signal?.aborted) {
          onAbort();
          return;
        }
        opts.signal?.addEventListener('abort', onAbort, { once: true });
      });
      if (!delayed || opts.signal?.aborted) return null;
    }

    if (this.fixedResult !== undefined) return this.fixedResult;

    if (this.pendingRaw && this.pendingRaw in this.map) {
      return this.map[this.pendingRaw]!;
    }

    const keys = Object.keys(this.map);
    if (keys.length === 1) return this.map[keys[0]!] ?? null;

    if (this.echo) return `echo:${pcm.length}`;
    return null;
  }
}

export class NoneRetranscriber implements Retranscriber {
  async transcribe(): Promise<string | null> {
    return null;
  }
}

export class OpenAiWhisperRetranscriber implements Retranscriber {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'whisper-1',
  ) {}

  async transcribe(pcm: Buffer, opts: RetranscribeOptions): Promise<string | null> {
    if (!this.apiKey || pcm.length === 0) return null;
    if (opts.signal?.aborted) return null;

    try {
      const wav = pcmToWav(pcm, opts.sampleRate, 1);
      const form = new FormData();
      const bytes = new Uint8Array(wav);
      form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'segment.wav');
      form.append('model', this.model);
      if (opts.language && opts.language !== 'auto') {
        form.append('language', opts.language.slice(0, 2));
      }
      form.append('response_format', 'json');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: form,
        signal: opts.signal,
      });

      if (!response.ok) return null;
      const json = (await response.json()) as { text?: string };
      const text = json.text?.trim();
      return text || null;
    } catch {
      return null;
    }
  }
}

export function createRetranscriber(
  name: 'mock' | 'openai' | 'none',
  apiKey?: string,
): Retranscriber {
  switch (name) {
    case 'openai':
      return new OpenAiWhisperRetranscriber(apiKey ?? '');
    case 'none':
      return new NoneRetranscriber();
    case 'mock':
    default:
      return new MockRetranscriber();
  }
}
