import type { WebSocket } from 'ws';
import type { Logger } from '../observability/logger.js';
import { createSpeechProvider } from '../speech/create-speech-provider.js';
import { createTranslationProvider } from '../translation/mock-translation-provider.js';
import type { UsageStore } from '../usage/usage-store.js';
import { TranslationSession } from './translation-session.js';

export class SessionManager {
  private readonly sessions = new Map<string, TranslationSession>();

  constructor(
    private readonly speechProviderName: string,
    private readonly translationProviderName: string,
    private readonly usage: UsageStore,
    private readonly logger: Logger,
    private readonly openaiApiKey?: string,
    private readonly deepgramApiKey?: string,
    private readonly deepgramModel?: string,
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
}
