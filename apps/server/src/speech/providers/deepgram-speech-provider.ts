import WebSocket from 'ws';
import type { SpeechSessionOptions, SpeechToTextProvider, TranscriptEvent } from '../speech-provider.js';

type DeepgramResultsMessage = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  duration?: number;
  channel?: {
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  };
};

/**
 * Deepgram live streaming STT — binary pcm_s16le frames over WebSocket.
 */
export class DeepgramSpeechProvider implements SpeechToTextProvider {
  private ws: WebSocket | null = null;
  private partialCb?: (event: TranscriptEvent) => void;
  private finalCb?: (event: TranscriptEvent) => void;
  private errorCb?: (error: Error) => void;
  private options?: SpeechSessionOptions;
  private closed = false;
  private segmentIndex = 0;
  private keepAliveTimer?: ReturnType<typeof setInterval>;
  private connectPromise?: Promise<void>;

  constructor(
    private readonly apiKey: string,
    private readonly model = 'nova-2',
  ) {}

  async connect(options: SpeechSessionOptions): Promise<void> {
    if (!this.apiKey) {
      throw new Error('DEEPGRAM_API_KEY is required for deepgram speech provider');
    }
    this.options = options;
    this.closed = false;
    this.segmentIndex = 0;

    const params = new URLSearchParams({
      model: this.model,
      encoding: 'linear16',
      sample_rate: String(options.sampleRate),
      channels: String(options.channels),
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      endpointing: '300',
    });

    if (options.sourceLanguage && options.sourceLanguage !== 'auto') {
      params.set('language', options.sourceLanguage);
    } else {
      params.set('language', 'multi');
    }

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });
      this.ws = ws;

      ws.on('open', () => {
        this.startKeepAlive();
        resolve();
      });

      ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      ws.on('error', (err) => {
        this.errorCb?.(err instanceof Error ? err : new Error(String(err)));
        reject(err);
      });

      ws.on('close', () => {
        this.clearKeepAlive();
        if (!this.closed) {
          this.errorCb?.(new Error('Deepgram connection closed unexpectedly'));
        }
      });
    });

    await this.connectPromise;
  }

  sendAudio(chunk: Buffer): void {
    if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(chunk);
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
    this.clearKeepAlive();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      } catch {
        // ignore
      }
      this.ws.close();
    }
    this.ws = null;
  }

  private handleMessage(raw: string): void {
    let message: DeepgramResultsMessage;
    try {
      message = JSON.parse(raw) as DeepgramResultsMessage;
    } catch {
      return;
    }

    if (message.type && message.type !== 'Results') return;

    const transcript = message.channel?.alternatives?.[0]?.transcript?.trim();
    if (!transcript) return;

    const segmentId = `dg-${this.options?.sessionId.slice(0, 8)}-${this.segmentIndex}`;
    const startMs = Math.round((message.start ?? 0) * 1000);
    const endMs = Math.round(((message.start ?? 0) + (message.duration ?? 0)) * 1000);

    if (message.is_final) {
      this.finalCb?.({
        segmentId,
        text: transcript,
        isFinal: true,
        startMs,
        endMs,
      });
      this.segmentIndex += 1;
    } else {
      this.partialCb?.({
        segmentId,
        text: transcript,
        isFinal: false,
        startMs,
        endMs,
      });
    }
  }

  private startKeepAlive(): void {
    this.clearKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 8_000);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = undefined;
  }
}

export function createDeepgramSpeechProvider(apiKey: string, model?: string): SpeechToTextProvider {
  return new DeepgramSpeechProvider(apiKey, model);
}
