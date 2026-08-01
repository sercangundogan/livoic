import type { GameTranslationProfile, MatchedTerminology } from './types.js';

export type TranslationValidationResult = {
  ok: boolean;
  translatedText: string;
  issues: string[];
  shouldRetry: boolean;
};

export class TranslationValidator {
  validate(input: {
    sourceText: string;
    translatedText: string;
    matchedTerminology: MatchedTerminology[];
    profile: GameTranslationProfile;
  }): TranslationValidationResult {
    let text = input.translatedText.trim();
    const issues: string[] = [];

    if (!text) {
      return { ok: false, translatedText: text, issues: ['empty'], shouldRetry: true };
    }

    text = text
      .replace(/^translation\s*:\s*/i, '')
      .replace(/^çeviri\s*:\s*/i, '')
      .trim();

    if (/__TERM_\d+__/.test(text)) {
      issues.push('unresolved-placeholder');
    }

    const preserve = input.matchedTerminology.filter((m) => m.behavior === 'preserve');
    for (const match of preserve) {
      if (!includesIgnoreCase(text, match.sourceTerm) && !includesIgnoreCase(text, match.normalizedTerm)) {
        // Deterministic restore when safe: append missing term is wrong; try replace common mangling
        const restored = tryRestoreTerm(text, match.sourceTerm);
        if (restored) {
          text = restored;
        } else {
          issues.push(`missing-preserve:${match.normalizedTerm}`);
        }
      }
    }

    const sourceLen = Math.max(1, input.sourceText.length);
    const ratio = text.length / sourceLen;
    if (ratio > 3.5 || ratio < 0.15) {
      issues.push('length-ratio');
    }

    if (/\(.*means.*\)/i.test(text) || /\bnote:\b/i.test(text)) {
      issues.push('explanation');
    }

    const shouldRetry = issues.some(
      (i) => i.startsWith('missing-preserve:') || i === 'unresolved-placeholder' || i === 'empty',
    );

    return {
      ok: issues.length === 0,
      translatedText: text,
      issues,
      shouldRetry,
    };
  }
}

function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function tryRestoreTerm(translated: string, term: string): string | null {
  // If translator lowercased or stripped punctuation lightly, reinject exact term when unique token lost.
  const tokens = term.split(/\s+/);
  if (tokens.length === 1) {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
    if (re.test(translated)) {
      return translated.replace(re, term);
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
