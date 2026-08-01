import type { WebSocket } from 'ws';
import type { Logger } from '../observability/logger.js';
import { createSpeechProvider } from '../speech/create-speech-provider.js';
import { createTranslationProvider } from '../translation/mock-translation-provider.js';
import type { UsageStore } from '../usage/usage-store.js';
import { createGameContextService } from '../game-context/game-context.service.js';
import type { TranscriptCorrectionConfig } from '../transcript-correction/index.js';
import type { TopicRoutingRuntimeConfig } from '../topic-routing/index.js';
import type { SentenceAssemblyRuntimeConfig } from '../sentence-assembly/index.js';
import { TranslationSession } from './translation-session.js';

export class SessionManager {
  private readonly sessions = new Map<string, TranslationSession>();
  private readonly gameContext = createGameContextService();

  constructor(
    private readonly speechProviderName: string,
    private readonly translationProviderName: string,
    private readonly usage: UsageStore,
    private readonly logger: Logger,
    private readonly openaiApiKey?: string,
    private readonly deepgramApiKey?: string,
    private readonly deepgramModel?: string,
    private readonly correction?: TranscriptCorrectionConfig,
    private readonly sampleRate = 16_000,
    private readonly topicRouting?: TopicRoutingRuntimeConfig,
    private readonly sentenceAssembly?: SentenceAssemblyRuntimeConfig,
  ) {}

  getOrCreate(sessionId: string, userId: string, socket: WebSocket): TranslationSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.attachSocket(socket);
      return existing;
    }

    const session = new TranslationSession({
      sessionId,
      userId,
      socket,
      speech: createSpeechProvider({
        name: this.speechProviderName,
        openaiApiKey: this.openaiApiKey,
        deepgramApiKey: this.deepgramApiKey,
        deepgramModel: this.deepgramModel,
      }),
      translation: createTranslationProvider(this.translationProviderName, this.openaiApiKey),
      usage: this.usage,
      logger: this.logger,
      gameContext: this.gameContext,
      correction: this.correction,
      openaiApiKey: this.openaiApiKey,
      sampleRate: this.sampleRate,
      topicRouting: this.topicRouting,
      sentenceAssembly: this.sentenceAssembly,
    });
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): TranslationSession | undefined {
    return this.sessions.get(sessionId);
  }

  async remove(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    await session.stop();
    this.sessions.delete(sessionId);
  }

  size(): number {
    return this.sessions.size;
  }

  listSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  getTranscriptDiagnostics(sessionId: string) {
    return this.sessions.get(sessionId)?.getTranscriptDiagnostics() ?? [];
  }

  getTranscriptMetrics(sessionId: string) {
    return this.sessions.get(sessionId)?.getTranscriptMetrics() ?? null;
  }
}
