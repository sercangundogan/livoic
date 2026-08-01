import WebSocket from 'ws';
import type { IncomingMessage } from 'node:http';
import type { SpeechSessionOptions, SpeechToTextProvider, TranscriptEvent } from '../speech-provider.js';

type DeepgramWord = {
  word?: string;
  punctuated_word?: string;
  confidence?: number;
  start?: number;
  end?: number;
};

type DeepgramResultsMessage = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  duration?: number;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
      words?: DeepgramWord[];
    }>;
  };
};

/**
 * Deepgram live streaming STT — binary pcm_s16le frames over WebSocket.
 *
 * Currently configured query features:
 * - interim_results, punctuate, smart_format, vad_events, utterance_end_ms, language
 *
 * NOT configured: keywords / keyterm / vocabulary boosts.
 *
 * Metadata actually forwarded from Results messages:
 * - Segment confidence (alternatives[0].confidence) — when present
 * - Segment start/end from message.start + duration
 * - Word list with per-word confidence/start/end — when Deepgram includes `words`
 *   (no extra query flag required; parsed if present)
 */
export class DeepgramSpeechProvider implements SpeechToTextProvider {
  private ws: WebSocket | null = null;
  private partialCb?: (event: TranscriptEvent) => void;
  private finalCb?: (event: TranscriptEvent) => void;
  private errorCb?: (error: Error) => void;
  private options?: SpeechSessionOptions;
  private closed = false;
  private segmentIndex = 0;
  private currentSegmentId = '';
  private keepAliveTimer?: ReturnType<typeof setInterval>;

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
    this.currentSegmentId = this.nextSegmentId();

    // Keep query params conservative — detect_language causes HTTP 400 on many model combos.
    const params = new URLSearchParams({
      model: this.model,
      encoding: 'linear16',
      sample_rate: String(options.sampleRate),
      channels: String(options.channels),
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      vad_events: 'true',
      utterance_end_ms: '1000',
    });

    const language =
      options.sourceLanguage && options.sourceLanguage !== 'auto'
        ? options.sourceLanguage
        : 'en';
    params.set('language', language);

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        this.errorCb?.(error);
        reject(error);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });
      this.ws = ws;

      ws.once('open', () => {
        this.startKeepAlive();
        succeed();
      });

      ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      ws.on('unexpected-response', (_req, res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8').slice(0, 500);
          fail(new Error(`Deepgram HTTP ${res.statusCode}: ${body || 'no body'}`));
        });
      });

      ws.once('error', (err) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });

      ws.on('close', () => {
        this.clearKeepAlive();
        if (!this.closed && !settled) {
          fail(new Error('Deepgram connection closed before open'));
        } else if (!this.closed) {
          this.errorCb?.(new Error('Deepgram connection closed unexpectedly'));
        }
      });
    });
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

    const alternative = message.channel?.alternatives?.[0];
    const transcript = alternative?.transcript?.trim();
    if (!transcript) return;

    const startMs = Math.round((message.start ?? 0) * 1000);
    const endMs = Math.round(((message.start ?? 0) + (message.duration ?? 0)) * 1000);
    const confidence =
      typeof alternative?.confidence === 'number' ? alternative.confidence : undefined;
    const words = (alternative?.words ?? [])
      .map((w) => {
        const word = (w.punctuated_word ?? w.word)?.trim();
        if (!word) return null;
        return {
          word,
          confidence: typeof w.confidence === 'number' ? w.confidence : undefined,
          startMs: typeof w.start === 'number' ? Math.round(w.start * 1000) : undefined,
          endMs: typeof w.end === 'number' ? Math.round(w.end * 1000) : undefined,
        };
      })
      .filter((w): w is NonNullable<typeof w> => w != null);

    if (message.is_final) {
      this.finalCb?.({
        segmentId: this.currentSegmentId,
        text: transcript,
        isFinal: true,
        language: 'en',
        startMs,
        endMs,
        confidence,
        words: words.length > 0 ? words : undefined,
      });
      this.segmentIndex += 1;
      this.currentSegmentId = this.nextSegmentId();
    } else {
      this.partialCb?.({
        segmentId: this.currentSegmentId,
        text: transcript,
        isFinal: false,
        language: 'en',
        startMs,
        endMs,
        confidence,
        words: words.length > 0 ? words : undefined,
      });
    }
  }

  private nextSegmentId(): string {
    return `dg-${this.options?.sessionId.slice(0, 8) ?? 'sess'}-${this.segmentIndex}`;
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
