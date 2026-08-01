import type { StreamContext } from '@live-translator/protocol';
import type { GameProfileLoader } from './game-profile.loader.js';
import { normalizeKey } from './game-profile.loader.js';
import type { ResolvedGameContext } from './types.js';

export class GameResolver {
  private readonly cache = new Map<string, ResolvedGameContext>();

  constructor(private readonly loader: GameProfileLoader) {}

  resolve(input: {
    gameName?: string;
    streamTitle?: string;
    gameSlug?: string;
  }): ResolvedGameContext {
    const cacheKey = [input.gameName, input.gameSlug, input.streamTitle]
      .map((v) => v?.toLowerCase().trim() ?? '')
      .join('|');
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    this.loader.loadAll();

    if (input.gameName) {
      const byName = this.matchName(input.gameName);
      if (byName) {
        this.cache.set(cacheKey, byName);
        return byName;
      }
    }

    if (input.gameSlug) {
      const bySlug = this.matchName(input.gameSlug.replace(/-/g, ' '));
      if (bySlug) {
        this.cache.set(cacheKey, bySlug);
        return bySlug;
      }
    }

    if (input.streamTitle) {
      const byTitle = this.matchInTitle(input.streamTitle);
      if (byTitle) {
        this.cache.set(cacheKey, byTitle);
        return byTitle;
      }
    }

    const fallback: ResolvedGameContext = {
      gameId: null,
      displayName: input.gameName,
      confidence: input.gameName ? 0.25 : 0,
      matchedBy: 'fallback',
    };
    this.cache.set(cacheKey, fallback);
    return fallback;
  }

  resolveFromStream(stream?: StreamContext): ResolvedGameContext {
    return this.resolve({
      gameName: stream?.gameName,
      streamTitle: stream?.streamTitle,
      gameSlug: stream?.gameSlug,
    });
  }

  private matchName(raw: string): ResolvedGameContext | null {
    const id = this.loader.resolveIdByAlias(raw);
    if (!id || id === 'generic-gaming') return null;
    const profile = this.loader.get(id);
    if (!profile) return null;

    const normalized = normalizeKey(raw);
    const exact = normalizeKey(profile.displayName) === normalized || normalizeKey(profile.id) === normalized;
    return {
      gameId: profile.id,
      displayName: profile.displayName,
      confidence: exact ? 1 : 0.9,
      matchedBy: exact ? 'exact-name' : 'alias',
    };
  }

  private matchInTitle(title: string): ResolvedGameContext | null {
    const normalizedTitle = ` ${normalizeKey(title)} `;
    let best: ResolvedGameContext | null = null;

    for (const profile of this.loader.list()) {
      if (profile.id === 'generic-gaming') continue;
      const candidates = [profile.displayName, profile.id, ...profile.aliases];
      for (const candidate of candidates) {
        const needle = normalizeKey(candidate);
        if (needle.length < 3) continue;
        if (normalizedTitle.includes(` ${needle} `)) {
          const confidence = Math.min(0.85, 0.55 + needle.length / 40);
          if (!best || confidence > best.confidence) {
            best = {
              gameId: profile.id,
              displayName: profile.displayName,
              confidence,
              matchedBy: 'stream-title',
            };
          }
        }
      }
    }
    return best;
  }
}
