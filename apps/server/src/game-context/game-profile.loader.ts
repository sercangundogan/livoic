import { GameTranslationProfileSchema, type GameTranslationProfile } from './types.js';
import { PROFILE_DOCUMENTS } from './profiles/index.js';

export class GameProfileLoader {
  private readonly profiles = new Map<string, GameTranslationProfile>();
  private readonly aliasIndex = new Map<string, string>();
  private loaded = false;

  loadAll(): Map<string, GameTranslationProfile> {
    if (this.loaded) return this.profiles;

    for (const doc of PROFILE_DOCUMENTS) {
      const parsed = GameTranslationProfileSchema.safeParse(doc);
      if (!parsed.success) {
        throw new Error(
          `Invalid game profile "${(doc as { id?: string }).id ?? 'unknown'}": ${parsed.error.message}`,
        );
      }
      const profile = parsed.data;
      if (this.profiles.has(profile.id)) {
        throw new Error(`Duplicate game profile id: ${profile.id}`);
      }
      this.profiles.set(profile.id, profile);
      this.indexAlias(profile.id, profile.id);
      this.indexAlias(profile.displayName, profile.id);
      for (const alias of profile.aliases) {
        this.indexAlias(alias, profile.id);
      }
    }

    if (!this.profiles.has('generic-gaming')) {
      throw new Error('Missing required generic-gaming profile');
    }

    this.loaded = true;
    return this.profiles;
  }

  get(id: string): GameTranslationProfile | undefined {
    this.loadAll();
    return this.profiles.get(id);
  }

  getGeneric(): GameTranslationProfile {
    this.loadAll();
    return this.profiles.get('generic-gaming')!;
  }

  resolveIdByAlias(name: string): string | undefined {
    this.loadAll();
    return this.aliasIndex.get(normalizeKey(name));
  }

  list(): GameTranslationProfile[] {
    this.loadAll();
    return [...this.profiles.values()];
  }

  private indexAlias(alias: string, profileId: string): void {
    const key = normalizeKey(alias);
    const existing = this.aliasIndex.get(key);
    if (existing && existing !== profileId) {
      throw new Error(`Duplicate alias "${alias}" for ${existing} and ${profileId}`);
    }
    this.aliasIndex.set(key, profileId);
  }
}

export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
