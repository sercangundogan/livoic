import type { WebSocket } from 'ws';
import type {
  ClientEvent,
  LanguageCode,
  Platform,
  ServerEvent,
  SessionStartEvent,
} from '@live-translator/protocol';
import type { Logger } from '../observability/logger.js';
import type { SpeechToTextProvider } from '../speech/speech-provider.js';
import type { TranslationProvider } from '../translation/translation-provider.js';
import { ContextManager } from '../translation/context-manager.js';
import type { UsageStore } from '../usage/usage-store.js';

export type TranslationSessionOptions = {
  sessionId: string;
  userId: string;
  socket: WebSocket;
  speech: SpeechToTextProvider;
  translation: TranslationProvider;
  usage: UsageStore;
  logger: Logger;
};

export class TranslationSession {
  readonly sessionId: string;
  readonly userId: string;
  private socket: WebSocket;
  private readonly speech: SpeechToTextProvider;
  private readonly translation: TranslationProvider;
  private readonly usage: UsageStore;
  private readonly logger: Logger;
  private readonly context = new ContextManager();
  private sequence = 0;
  private targetLanguage: LanguageCode = 'tr';
  private platform: Platform = 'twitch';
  private started = false;
  private audioBytes = 0;
  private lastUsageEmit = 0;
  private closed = false;

  constructor(options: TranslationSessionOptions) {
    this.sessionId = options.sessionId;
    this.userId = options.userId;
    this.socket = options.socket;
    this.speech = options.speech;
    this.translation = options.translation;
    this.usage = options.usage;
    this.logger = options.logger;
  }

  attachSocket(socket: WebSocket): void {
    this.socket = socket;
  }

  async handleClientEvent(event: ClientEvent): Promise<void> {
    switch (event.type) {
      case 'session.start':
        await this.start(event);
        break;
      case 'session.stop':
        await this.stop();
        break;
      case 'session.resume':
        this.send({
          type: 'session.status',
          sessionId: this.sessionId,
          sequence: this.nextSequence(),
          timestamp: Date.now(),
          status: 'listening',
          message: 'Session resumed',
        });
        break;
      case 'settings.update':
        if (event.targetLanguage) this.targetLanguage = event.targetLanguage;
        break;
      case 'ping':
        this.send({
          type: 'pong',
          sessionId: this.sessionId,
          sequence: this.nextSequence(),
          timestamp: Date.now(),
          clientTime: event.clientTime,
        });
        break;
    }
  }

  async handleAudio(chunk: Buffer): Promise<void> {
    if (!this.started || this.closed) return;
    this.audioBytes += chunk.length;
    this.speech.sendAudio(chunk);

    // pcm_s16le mono 16kHz: 2 bytes per sample → seconds = bytes / (16000 * 2)
    const seconds = chunk.length / (16_000 * 2);
    const record = this.usage.addAudioSeconds(this.sessionId, seconds);
    const now = Date.now();
    if (record && now - this.lastUsageEmit > 10_000) {
      this.lastUsageEmit = now;
      this.send({
        type: 'usage.update',
        sessionId: this.sessionId,
        sequence: this.nextSequence(),
        timestamp: now,
        audioSeconds: Math.floor(record.audioSeconds),
        audioSecondsToday: Math.floor(this.usage.getTodaySeconds(this.userId)),
      });
    }
  }

  private async start(event: SessionStartEvent): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.targetLanguage = event.targetLanguage;
    this.platform = event.platform;

    this.usage.start({
      userId: this.userId,
      sessionId: this.sessionId,
      startedAt: new Date(),
      targetLanguage: event.targetLanguage,
      platform: event.platform,
    });

    this.speech.onPartial((partial) => {
      this.send({
        type: 'transcript.partial',
        sessionId: this.sessionId,
        sequence: this.nextSequence(),
        timestamp: Date.now(),
        segmentId: partial.segmentId,
        text: partial.text,
        startMs: partial.startMs,
        endMs: partial.endMs,
      });
    });

    this.speech.onFinal(async (final) => {
      this.send({
        type: 'transcript.final',
        sessionId: this.sessionId,
        sequence: this.nextSequence(),
        timestamp: Date.now(),
        segmentId: final.segmentId,
        text: final.text,
        language: final.language,
        startMs: final.startMs,
        endMs: final.endMs,
      });

      const previous = this.context.getPrevious();
      const translationRequestedAt = Date.now();
      try {
        const result = await this.translation.translate({
          text: final.text,
          sourceLanguage: final.language,
          targetLanguage: this.targetLanguage,
          previousSegments: previous,
          platform: this.platform,
        });
        this.context.push(final.text);
        this.logger.info('translation_completed', {
          sessionId: this.sessionId,
          segmentId: final.segmentId,
          latencyMs: Date.now() - translationRequestedAt,
        });
        this.send({
          type: 'translation.final',
          sessionId: this.sessionId,
          sequence: this.nextSequence(),
          timestamp: Date.now(),
          segmentId: final.segmentId,
          sourceText: final.text,
          translatedText: result.translatedText,
          startMs: final.startMs,
          endMs: final.endMs,
        });
      } catch (error) {
        this.logger.error('translation_failed', {
          sessionId: this.sessionId,
          error: error instanceof Error ? error.message : 'unknown',
        });
        this.send({
          type: 'error',
          sessionId: this.sessionId,
          sequence: this.nextSequence(),
          timestamp: Date.now(),
          code: 'PROVIDER_UNAVAILABLE',
          message: 'Live translation is temporarily unavailable.',
          recoverable: true,
        });
      }
    });

    this.speech.onError((error) => {
      this.logger.error('speech_error', {
        sessionId: this.sessionId,
        error: error.message,
      });
      this.send({
        type: 'error',
        sessionId: this.sessionId,
        sequence: this.nextSequence(),
        timestamp: Date.now(),
        code: 'PROVIDER_UNAVAILABLE',
        message: 'Live translation is temporarily unavailable.',
        recoverable: true,
      });
    });

    await this.speech.connect({
      sessionId: this.sessionId,
      sourceLanguage: event.sourceLanguage,
      sampleRate: event.sampleRate,
      channels: event.channels,
    });

    this.send({
      type: 'session.ready',
      sessionId: this.sessionId,
      sequence: this.nextSequence(),
      timestamp: Date.now(),
      detectedSourceLanguage: 'en',
    });

    this.send({
      type: 'session.status',
      sessionId: this.sessionId,
      sequence: this.nextSequence(),
      timestamp: Date.now(),
      status: 'listening',
    });

    this.logger.info('session_started', {
      sessionId: this.sessionId,
      userId: this.userId,
      platform: event.platform,
      targetLanguage: event.targetLanguage,
    });
  }

  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.started = false;
    await this.speech.close();
    this.usage.end(this.sessionId);
    this.send({
      type: 'session.status',
      sessionId: this.sessionId,
      sequence: this.nextSequence(),
      timestamp: Date.now(),
      status: 'stopped',
    });
    this.logger.info('session_stopped', {
      sessionId: this.sessionId,
      audioBytes: this.audioBytes,
    });
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private send(event: ServerEvent): void {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }
}
