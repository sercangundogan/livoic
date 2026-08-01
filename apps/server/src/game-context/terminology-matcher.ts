import type { GameTranslationProfile, MatchedTerminology } from './types.js';

type DictionaryEntry = {
  term: string;
  normalized: string;
  behavior: MatchedTerminology['behavior'];
  preferredOutput?: string;
  wordCount: number;
};

export class TerminologyMatcher {
  match(text: string, profile: GameTranslationProfile): MatchedTerminology[] {
    if (!text.trim()) return [];

    const dictionary = this.buildDictionary(profile);
    const lower = text.toLowerCase();
    const occupied = new Array<boolean>(text.length).fill(false);
    const matches: MatchedTerminology[] = [];

    for (const entry of dictionary) {
      let from = 0;
      while (from < lower.length) {
        const idx = lower.indexOf(entry.normalized, from);
        if (idx < 0) break;
        const end = idx + entry.normalized.length;
        if (!isBoundary(lower, idx, end) || overlaps(occupied, idx, end)) {
          from = idx + 1;
          continue;
        }
        for (let i = idx; i < end; i++) occupied[i] = true;
        const sourceTerm = text.slice(idx, end);
        matches.push({
          sourceTerm,
          normalizedTerm: entry.term,
          behavior: entry.behavior,
          preferredOutput: entry.preferredOutput,
          startIndex: idx,
          endIndex: end,
        });
        from = end;
      }
    }

    return matches.sort((a, b) => a.startIndex - b.startIndex);
  }

  private buildDictionary(profile: GameTranslationProfile): DictionaryEntry[] {
    const map = new Map<string, DictionaryEntry>();

    const add = (
      term: string,
      behavior: MatchedTerminology['behavior'],
      preferredOutput?: string,
    ) => {
      const normalized = term.toLowerCase();
      const existing = map.get(normalized);
      const entry: DictionaryEntry = {
        term,
        normalized,
        behavior,
        preferredOutput,
        wordCount: term.trim().split(/\s+/).length,
      };
      if (!existing || entry.wordCount > existing.wordCount || behavior === 'preserve') {
        map.set(normalized, entry);
      }
    };

    for (const term of profile.preserveTerms) {
      add(term, 'preserve', term);
    }
    for (const [term, preferred] of Object.entries(profile.preferredTranslations)) {
      add(term, 'preferred-translation', preferred);
    }
    for (const contextual of profile.contextualTerms) {
      const behavior = contextual.preserve ? 'preserve' : 'contextual';
      add(contextual.term, behavior, contextual.preferredTranslation ?? contextual.term);
      for (const alias of contextual.aliases ?? []) {
        add(alias, behavior, contextual.preferredTranslation ?? contextual.term);
      }
    }

    return [...map.values()].sort((a, b) => b.normalized.length - a.normalized.length);
  }
}

function isBoundary(lower: string, start: number, end: number): boolean {
  const before = start === 0 ? ' ' : lower[start - 1]!;
  const after = end >= lower.length ? ' ' : lower[end]!;
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

function overlaps(occupied: boolean[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (occupied[i]) return true;
  }
  return false;
}

export function protectTerms(
  text: string,
  matched: MatchedTerminology[],
): { maskedText: string; termMap: Record<string, string> } {
  const preserve = matched
    .filter((m) => m.behavior === 'preserve')
    .sort((a, b) => b.startIndex - a.startIndex);

  let maskedText = text;
  const termMap: Record<string, string> = {};
  let i = 0;

  for (const match of preserve) {
    const token = `__TERM_${i}__`;
    termMap[token] = match.sourceTerm;
    maskedText =
      maskedText.slice(0, match.startIndex) + token + maskedText.slice(match.endIndex);
    i += 1;
  }

  return { maskedText, termMap };
}

export function restoreTerms(
  translatedText: string,
  termMap: Record<string, string>,
): { text: string; unresolved: string[] } {
  let text = translatedText;
  const unresolved: string[] = [];
  for (const [token, original] of Object.entries(termMap)) {
    if (!text.includes(token)) {
      unresolved.push(token);
      continue;
    }
    text = text.split(token).join(original);
  }
  // Catch leftover placeholders
  const leftover = text.match(/__TERM_\d+__/g) ?? [];
  unresolved.push(...leftover);
  return { text, unresolved: [...new Set(unresolved)] };
}
