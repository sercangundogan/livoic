import type { StreamContext } from '@live-translator/protocol';
import { GameProfileLoader } from './game-profile.loader.js';
import { GameResolver } from './game-resolver.js';
import { GameAwarePromptBuilder } from './prompt-builder.js';
import {
  TerminologyMatcher,
  protectTerms,
  restoreTerms,
} from './terminology-matcher.js';
import { TranslationMemory } from './translation-memory.js';
import { TranslationValidator } from './translation-validator.js';
import type {
  GameTranslationProfile,
  MatchedTerminology,
  ResolvedGameContext,
  TranslationMemoryEntry,
  TranslationPrompt,
} from './types.js';

export class GameContextService {
  private readonly loader = new GameProfileLoader();
  private readonly resolver = new GameResolver(this.loader);
  private readonly matcher = new TerminologyMatcher();
  private readonly promptBuilder = new GameAwarePromptBuilder();
  private readonly validator = new TranslationValidator();

  constructor() {
    this.loader.loadAll();
  }

  getTranslationContext(streamContext?: StreamContext): {
    resolvedGame: ResolvedGameContext;
    profile: GameTranslationProfile;
  } {
    const resolvedGame = this.resolver.resolveFromStream(streamContext);
    if (resolvedGame.gameId && resolvedGame.confidence >= 0.55) {
      const profile = this.loader.get(resolvedGame.gameId);
      if (profile) {
        return { resolvedGame, profile };
      }
    }
    return {
      resolvedGame: {
        ...resolvedGame,
        gameId: null,
        matchedBy: resolvedGame.matchedBy === 'fallback' ? 'fallback' : resolvedGame.matchedBy,
        confidence: Math.min(resolvedGame.confidence, 0.4),
      },
      profile: this.loader.getGeneric(),
    };
  }

  matchTerms(text: string, profile: GameTranslationProfile): MatchedTerminology[] {
    return this.matcher.match(text, profile);
  }

  buildPrompt(input: {
    currentText: string;
    previousSegments: string[];
    targetLanguage: string;
    sourceLanguage?: string;
    resolvedGame: ResolvedGameContext;
    profile: GameTranslationProfile;
    matchedTerminology: MatchedTerminology[];
    sessionMemory: TranslationMemoryEntry[];
  }): TranslationPrompt {
    return this.promptBuilder.build({
      currentText: input.currentText,
      previousSegments: input.previousSegments,
      targetLanguage: input.targetLanguage,
      sourceLanguage: input.sourceLanguage,
      gameContext: input.resolvedGame,
      gameProfile: input.profile,
      matchedTerminology: input.matchedTerminology,
      sessionMemory: input.sessionMemory,
    });
  }

  protect(text: string, matched: MatchedTerminology[]) {
    return protectTerms(text, matched);
  }

  restore(translatedText: string, termMap: Record<string, string>) {
    return restoreTerms(translatedText, termMap);
  }

  validate(input: {
    sourceText: string;
    translatedText: string;
    matchedTerminology: MatchedTerminology[];
    profile: GameTranslationProfile;
  }) {
    return this.validator.validate(input);
  }

  createMemory(): TranslationMemory {
    return new TranslationMemory();
  }
}

export function createGameContextService(): GameContextService {
  return new GameContextService();
}
