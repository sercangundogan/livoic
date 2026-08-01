import type { TranslationMemoryEntry } from './types.js';

const MAX_ENTRIES = 120;

export class TranslationMemory {
  private readonly entries = new Map<string, TranslationMemoryEntry>();

  getRelevantEntries(text: string, gameId: string | null): TranslationMemoryEntry[] {
    const lower = text.toLowerCase();
    const relevant: TranslationMemoryEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.gameId && gameId && entry.gameId !== gameId) continue;
      if (lower.includes(entry.normalizedSource)) {
        relevant.push(entry);
      }
    }
    return relevant
      .sort((a, b) => priority(b) - priority(a) || b.usageCount - a.usageCount)
      .slice(0, 8);
  }

  remember(entry: TranslationMemoryEntry): void {
    const key = memoryKey(entry.normalizedSource, entry.gameId);
    const existing = this.entries.get(key);
    if (existing && priority(existing) > priority(entry)) {
      existing.usageCount += 1;
      existing.lastUsedAt = Date.now();
      return;
    }
    this.entries.set(key, {
      ...entry,
      usageCount: (existing?.usageCount ?? 0) + 1,
      lastUsedAt: Date.now(),
    });
    this.evict();
  }

  clearGameSpecific(keepGeneric = true): void {
    for (const [key, entry] of this.entries) {
      if (entry.gameId && !(keepGeneric && entry.gameId === null)) {
        this.entries.delete(key);
      }
    }
  }

  clearSession(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private evict(): void {
    if (this.entries.size <= MAX_ENTRIES) return;
    const sorted = [...this.entries.entries()].sort(
      (a, b) => a[1].lastUsedAt - b[1].lastUsedAt,
    );
    const removeCount = this.entries.size - MAX_ENTRIES;
    for (let i = 0; i < removeCount; i++) {
      const key = sorted[i]?.[0];
      if (key) this.entries.delete(key);
    }
  }
}

function memoryKey(normalizedSource: string, gameId: string | null): string {
  return `${gameId ?? 'generic'}::${normalizedSource}`;
}

function priority(entry: TranslationMemoryEntry): number {
  switch (entry.sourceType) {
    case 'user':
      return 40;
    case 'profile':
      return 30;
    case 'community':
      return 20;
    case 'provider':
      return 10;
    default:
      return 0;
  }
}
