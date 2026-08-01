import { TranslationMemory } from '../game-context/translation-memory.js';
import type { TranslationRoute } from './types.js';

export class RoutedTranslationMemory {
  readonly game = new TranslationMemory();
  readonly general = new TranslationMemory();

  getForRoute(route: TranslationRoute): TranslationMemory {
    if (route === 'general') {
      return this.general;
    }
    // game-aware and conservative share game memory (conservative only uses explicit terms)
    return this.game;
  }

  clearSession(): void {
    this.game.clearSession();
    this.general.clearSession();
  }

  clearGame(): void {
    this.game.clearSession();
  }
}
