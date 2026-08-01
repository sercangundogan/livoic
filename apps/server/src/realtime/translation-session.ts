import type { WebSocket } from 'ws';
import type {
  ClientEvent,
  LanguageCode,
  Platform,
  ServerEvent,
  SessionStartEvent,
  StreamContext,
} from '@live-translator/protocol';
import type { Logger } from '../observability/logger.js';
import type { SpeechToTextProvider } from '../speech/speech-provider.js';
import type { TranslationProvider } from '../translation/translation-provider.js';
import { ContextManager } from '../translation/context-manager.js';
import type { UsageStore } from '../usage/usage-store.js';
import type { GameContextService } from '../game-context/game-context.service.js';
import type { TranslationMemory } from '../game-context/translation-memory.js';
import type {
  GameTranslationProfile,
  ResolvedGameContext,
} from '../game-context/types.js';
import {
  AudioRingBuffer,
  createRetranscriber,
  MockRetranscriber,
  SessionTranscriptDiagnostics,
  TranscriptCorrectionService,
  TranscriptStore,
  summarizeWordConfidence,
  type Retranscriber,
  type TranscriptCorrectionConfig,
} from '../transcript-correction/index.js';

export type TranslationSessionOptions = {
  sessionId: string;
  userId: string;
  socket: WebSocket;
  speech: SpeechToTextProvider;
  translation: TranslationProvider;
  usage: UsageStore;
  logger: Logger;
  gameContext: GameContextService;
  correction?: TranscriptCorrectionConfig;
  openaiApiKey?: string;
  sampleRate?: number;
};

export class TranslationSession {
  readonly sessionId: string;
  readonly userId: string;
  private socket: WebSocket;
  private readonly speech: SpeechToTextProvider;
  private readonly translation: TranslationProvider;
  private readonly usage: UsageStore;
  private readonly logger: Logger;
  private readonly gameContext: GameContextService;
  private readonly context = new ContextManager();
  private readonly memory: TranslationMemory;
  private readonly correctionConfig: TranscriptCorrectionConfig;
  private readonly transcriptStore = new TranscriptStore();
  private readonly retranscriber: Retranscriber;
  private readonly correctionService: TranscriptCorrectionService;
  private readonly diagnostics = new SessionTranscriptDiagnostics();
  private readonly diagnosticsEnabled: boolean;
  private audioBuffer: AudioRingBuffer;
  private sampleRate: number;
  private sequence = 0;
  private targetLanguage: LanguageCode = 'tr';
  private platform: Platform = 'twitch';
  private streamContext?: StreamContext;
  private resolvedGame?: ResolvedGameContext;
  private gameProfile?: GameTranslationProfile;
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
    this.gameContext = options.gameContext;
    this.memory = options.gameContext.createMemory();
    this.sampleRate = options.sampleRate ?? 16_000;
    this.correctionConfig = options.correction ?? {
      enabled: true,
      confidenceThreshold: 0.72,
      retranscribeTimeoutMs: 2500,
      audioBufferMaxSeconds: 45,
      retranscribeProvider: 'mock',
    };
    this.audioBuffer = new AudioRingBuffer(
      this.sampleRate,
      this.correctionConfig.audioBufferMaxSeconds,
    );
    this.retranscriber = createRetranscriber(
      this.correctionConfig.retranscribeProvider,
      options.openaiApiKey,
    );
    this.correctionService = new TranscriptCorrectionService(this.transcriptStore);
    this.diagnosticsEnabled = process.env.NODE_ENV !== 'production';
  }

  /** Development-only transcript segment diagnostics (includes text). Empty in production. */
  getTranscriptDiagnostics() {
    if (!this.diagnosticsEnabled) return [];
    return this.diagnostics.getSegments();
  }

  getTranscriptMetrics() {
    return this.diagnostics.getMetrics();
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
      case 'stream.context.update':
        this.applyStreamContext(event.streamContext, true);
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
    this.audioBuffer.push(chunk);
    this.speech.sendAudio(chunk);

    const seconds = chunk.length / (this.sampleRate * 2);
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

  private applyStreamContext(streamContext: StreamContext, emit: boolean): void {
    const previousGameId = this.resolvedGame?.gameId ?? null;
    this.streamContext = {
      ...streamContext,
      detectedAt: streamContext.detectedAt ?? Date.now(),
    };
    const { resolvedGame, profile } = this.gameContext.getTranslationContext(this.streamContext);
    this.resolvedGame = resolvedGame;
    this.gameProfile = profile;

    if (previousGameId && previousGameId !== resolvedGame.gameId) {
      this.memory.clearGameSpecific(true);
      this.context.clear();
    }

    if (emit) {
      this.emitContextReady();
    }
  }

  private emitContextReady(): void {
    const profileApplied = Boolean(
      this.resolvedGame?.gameId && this.gameProfile && this.gameProfile.id !== 'generic-gaming',
    );
    this.send({
      type: 'translation.context.ready',
      sessionId: this.sessionId,
      sequence: this.nextSequence(),
      timestamp: Date.now(),
      game: {
        id: this.resolvedGame?.gameId ?? null,
        displayName:
          this.resolvedGame?.displayName ??
          this.streamContext?.gameName ??
          this.gameProfile?.displayName,
        profileApplied,
        confidence: this.resolvedGame?.confidence,
      },
    });
  }

  private async translateSegment(final: {
    segmentId: string;
    text: string;
    language?: string;
    startMs?: number;
    endMs?: number;
  }): Promise<{ translatedText?: string; latencyMs: number }> {
    const profile = this.gameProfile ?? this.gameContext.getTranslationContext().profile;
    const resolved =
      this.resolvedGame ?? this.gameContext.getTranslationContext(this.streamContext).resolvedGame;
    const previous = this.context.getPrevious();
    const matched = this.gameContext.matchTerms(final.text, profile);
    const sessionMemory = this.memory.getRelevantEntries(final.text, resolved.gameId);
    const { maskedText, termMap } = this.gameContext.protect(final.text, matched);
    const prompt = this.gameContext.buildPrompt({
      currentText: maskedText,
      previousSegments: previous,
      targetLanguage: this.targetLanguage,
      sourceLanguage: final.language,
      resolvedGame: resolved,
      profile,
      matchedTerminology: matched,
      sessionMemory,
    });

    const translationRequestedAt = Date.now();
    let translatedText = '';
    let retryCount = 0;

    const runProvider = async (stronger = false) => {
      const result = await this.translation.translate({
        text: maskedText,
        sourceLanguage: final.language,
        targetLanguage: this.targetLanguage,
        previousSegments: previous,
        platform: this.platform,
        category: this.streamContext?.gameName,
        prompt: stronger
          ? {
              system: `${prompt.system}\n\nCRITICAL: Preserve every placeholder token like __TERM_0__ unchanged, and preserve all official game names exactly.`,
              user: prompt.user,
            }
          : prompt,
        domainContext: {
          type: 'gaming',
          name: resolved.displayName ?? profile.displayName,
          description: profile.contextDescription,
          terminology: matched.slice(0, 12).map((m) => ({
            source: m.sourceTerm,
            behavior: m.behavior === 'preserve' ? 'preserve' : 'preferred',
            target: m.preferredOutput,
          })),
          examples: profile.examples.slice(0, 3),
        },
      });
      return result.translatedText;
    };

    try {
      translatedText = await runProvider(false);
      const restored = this.gameContext.restore(translatedText, termMap);
      translatedText = restored.text;

      let validation = this.gameContext.validate({
        sourceText: final.text,
        translatedText,
        matchedTerminology: matched,
        profile,
      });
      translatedText = validation.translatedText;

      if (!validation.ok && validation.shouldRetry) {
        retryCount = 1;
        translatedText = await runProvider(true);
        const restoredRetry = this.gameContext.restore(translatedText, termMap);
        translatedText = restoredRetry.text;
        validation = this.gameContext.validate({
          sourceText: final.text,
          translatedText,
          matchedTerminology: matched,
          profile,
        });
        translatedText = validation.translatedText;
        if (restoredRetry.unresolved.length || !validation.ok) {
          this.logger.warn('game_translation.validation_failed', {
            sessionId: this.sessionId,
            gameId: resolved.gameId,
            issues: validation.issues,
            unresolvedPlaceholders: restoredRetry.unresolved.length,
          });
        }
      }

      for (const match of matched) {
        if (match.behavior === 'preserve') {
          this.memory.remember({
            source: match.sourceTerm,
            target: match.sourceTerm,
            normalizedSource: match.normalizedTerm.toLowerCase(),
            gameId: resolved.gameId,
            usageCount: 1,
            lastUsedAt: Date.now(),
            sourceType: 'profile',
          });
        }
      }
      this.memory.remember({
        source: final.text,
        target: translatedText,
        normalizedSource: final.text.toLowerCase().slice(0, 80),
        gameId: resolved.gameId,
        usageCount: 1,
        lastUsedAt: Date.now(),
        sourceType: 'provider',
      });

      this.context.push(final.text);
      const latencyMs = Date.now() - translationRequestedAt;
      this.logger.info('game_translation.completed', {
        sessionId: this.sessionId,
        gameId: resolved.gameId,
        matchedTermCount: matched.length,
        memoryHitCount: sessionMemory.length,
        validationPassed: true,
        retryCount,
        latencyMs,
      });

      this.send({
        type: 'translation.final',
        sessionId: this.sessionId,
        sequence: this.nextSequence(),
        timestamp: Date.now(),
        segmentId: final.segmentId,
        sourceText: final.text,
        translatedText,
        startMs: final.startMs,
        endMs: final.endMs,
      });
      return { translatedText, latencyMs };
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
      return { latencyMs: Date.now() - translationRequestedAt };
    }
  }

  private async start(event: SessionStartEvent): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.targetLanguage = event.targetLanguage;
    this.platform = event.platform;
    this.sampleRate = event.sampleRate || this.sampleRate;
    this.audioBuffer = new AudioRingBuffer(
      this.sampleRate,
      this.correctionConfig.audioBufferMaxSeconds,
    );
    this.applyStreamContext(
      event.streamContext ?? {
        platform: 'twitch',
        detectedAt: Date.now(),
      },
      false,
    );

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
      if (!final.text.trim()) return;
      const pipelineStarted = Date.now();

      // Emit raw transcript (protocol unchanged)
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

      const profile = this.gameProfile ?? this.gameContext.getTranslationContext().profile;
      if (this.retranscriber instanceof MockRetranscriber) {
        this.retranscriber.pendingRaw = final.text;
      }

      const correction = await this.correctionService.correctFinalSegment({
        segmentId: final.segmentId,
        rawText: final.text,
        confidence: final.confidence,
        startMs: final.startMs,
        endMs: final.endMs,
        language: final.language,
        profile,
        sampleRate: this.sampleRate,
        audioBuffer: this.audioBuffer,
        retranscriber: this.retranscriber,
        confidenceThreshold: this.correctionConfig.confidenceThreshold,
        retranscribeTimeoutMs: this.correctionConfig.retranscribeTimeoutMs,
        enabled: this.correctionConfig.enabled,
      });

      this.logger.info('transcript_correction.completed', {
        sessionId: this.sessionId,
        segmentId: final.segmentId,
        rawLength: correction.rawText.length,
        correctedLength: correction.correctedText?.length ?? 0,
        usedCorrected: Boolean(correction.correctedText),
        retranscribed: correction.retranscribed,
        normalized: correction.normalized,
        timedOut: correction.timedOut,
        isLowConfidence: correction.evaluation.isLowConfidence,
        shouldRetranscribe: correction.evaluation.shouldRetranscribe,
        correctionSource: correction.correctionSource,
        retranscribeLatencyMs: correction.retranscribeLatencyMs,
        normalizeLatencyMs: correction.normalizeLatencyMs,
        reasonCount: correction.evaluation.reasons.length,
        confidenceMissing: typeof final.confidence !== 'number',
      });

      const translation = await this.translateSegment({
        segmentId: final.segmentId,
        text: correction.textForTranslation,
        language: final.language,
        startMs: final.startMs,
        endMs: final.endMs,
      });

      const totalSubtitleLatencyMs = Date.now() - pipelineStarted;
      const wordConfidenceSummary = summarizeWordConfidence(
        final.words,
        this.correctionConfig.confidenceThreshold,
      );

      this.diagnostics.record(
        {
          segmentId: final.segmentId,
          rawTranscript: correction.rawText,
          retranscribedTranscript: correction.retranscribedText,
          correctedTranscript: correction.correctedText,
          translatedText: translation.translatedText,
          sttConfidence: final.confidence,
          wordConfidenceSummary,
          qualityScore: correction.evaluation.score,
          qualityReasons: correction.evaluation.reasons,
          shouldRetranscribe: correction.evaluation.shouldRetranscribe,
          correctionSource: correction.correctionSource,
          retranscribeLatencyMs: correction.retranscribeLatencyMs,
          normalizeLatencyMs: correction.normalizeLatencyMs,
          translationLatencyMs: translation.latencyMs,
          totalSubtitleLatencyMs,
          timedOut: correction.timedOut,
          confidenceMissing: typeof final.confidence !== 'number',
        },
        correction.evaluation,
      );

      const metrics = this.diagnostics.getMetrics();
      for (const warning of metrics.warnings) {
        this.logger.warn('transcript_correction_metric_warning', {
          sessionId: this.sessionId,
          warning,
          // aggregates only — no transcript text
          totalFinalizedSegments: metrics.totalFinalizedSegments,
          retranscriptionRate: metrics.retranscriptionRate,
          averageLowConfidencePathLatencyMs: metrics.averageLowConfidencePathLatencyMs,
        });
      }

      if (this.diagnosticsEnabled) {
        this.logger.debug('transcript_segment_diagnostics', {
          sessionId: this.sessionId,
          segmentId: final.segmentId,
          rawTranscript: correction.rawText,
          retranscribedTranscript: correction.retranscribedText,
          correctedTranscript: correction.correctedText,
          translatedText: translation.translatedText,
          sttConfidence: final.confidence,
          wordConfidenceAvailable: wordConfidenceSummary.available,
          wordConfidenceAvg: wordConfidenceSummary.avg,
          qualityScore: correction.evaluation.score,
          qualityReasons: correction.evaluation.reasons,
          shouldRetranscribe: correction.evaluation.shouldRetranscribe,
          correctionSource: correction.correctionSource,
          retranscribeLatencyMs: correction.retranscribeLatencyMs,
          normalizeLatencyMs: correction.normalizeLatencyMs,
          translationLatencyMs: translation.latencyMs,
          totalSubtitleLatencyMs,
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

    try {
      await this.speech.connect({
        sessionId: this.sessionId,
        sourceLanguage: event.sourceLanguage,
        sampleRate: event.sampleRate,
        channels: event.channels,
      });
    } catch (error) {
      this.started = false;
      this.logger.error('speech_connect_failed', {
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
      return;
    }

    this.send({
      type: 'session.ready',
      sessionId: this.sessionId,
      sequence: this.nextSequence(),
      timestamp: Date.now(),
      detectedSourceLanguage: 'en',
    });

    this.emitContextReady();

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
      gameId: this.resolvedGame?.gameId,
      gameConfidence: this.resolvedGame?.confidence,
      profileId: this.gameProfile?.id,
    });
  }

  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.started = false;
    await this.speech.close();
    this.audioBuffer.clear();
    this.transcriptStore.clear();
    const metrics = this.diagnostics.getMetrics();
    this.logger.info('session_transcript_metrics', {
      sessionId: this.sessionId,
      ...metrics,
    });
    this.diagnostics.clear();
    this.usage.end(this.sessionId);
    this.memory.clearSession();
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
