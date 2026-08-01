import type { GameTranslationProfile } from '../game-context/types.js';
import type { QualityEvaluation } from './types.js';

export type EvaluateQualityInput = {
  text: string;
  confidence?: number;
  threshold: number;
  profile?: GameTranslationProfile;
};

/**
 * Levenshtein edit distance (small strings only — preserve-term near-miss checks).
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

function collectPreserveTerms(profile?: GameTranslationProfile): string[] {
  if (!profile) return [];
  const terms = new Set<string>();
  for (const t of profile.preserveTerms) terms.add(t.toLowerCase());
  // Only alias targets — `from` forms are handled by the normalizer, not re-STT.
  for (const alias of profile.phoneticAliases ?? []) {
    terms.add(alias.to.toLowerCase());
  }
  return [...terms].filter((t) => t.length >= 3);
}

function collectAliasFroms(profile?: GameTranslationProfile): Set<string> {
  const set = new Set<string>();
  for (const alias of profile?.phoneticAliases ?? []) {
    set.add(alias.from.toLowerCase());
  }
  return set;
}

/**
 * Strong near-miss: a transcript token is edit-distance 1–2 from a preserve/alias term
 * and not an exact match (suggests STT mangled a game term).
 * Known phonetic `from` tokens are excluded — they go through contextual normalization.
 */
function hasStrongNearMiss(text: string, profile?: GameTranslationProfile): string | undefined {
  const terms = collectPreserveTerms(profile);
  if (terms.length === 0) return undefined;
  const aliasFroms = collectAliasFroms(profile);

  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9']+/i)
    .filter((t) => t.length >= 3);

  for (const token of tokens) {
    if (aliasFroms.has(token)) continue;
    for (const term of terms) {
      if (token === term) continue;
      // Avoid comparing wildly different lengths
      if (Math.abs(token.length - term.length) > 2) continue;
      const dist = editDistance(token, term);
      if (dist >= 1 && dist <= 2) {
        return `near_miss:${token}~${term}`;
      }
    }
  }
  return undefined;
}

export function evaluateQuality(input: EvaluateQualityInput): QualityEvaluation {
  const reasons: string[] = [];
  const text = input.text.trim();

  if (!text) {
    return {
      score: 0,
      isLowConfidence: true,
      shouldRetranscribe: false,
      reasons: ['empty_text'],
    };
  }

  if (typeof input.confidence === 'number') {
    const score = Math.max(0, Math.min(1, input.confidence));
    const isLowConfidence = score < input.threshold;
    if (isLowConfidence) reasons.push('confidence_below_threshold');
    return {
      score,
      isLowConfidence,
      shouldRetranscribe: isLowConfidence,
      reasons,
    };
  }

  // Missing confidence: prefer skipping retranscription unless a strong heuristic fires.
  const nearMiss = hasStrongNearMiss(text, input.profile);
  if (nearMiss) {
    reasons.push(nearMiss);
    return {
      score: 0.5,
      isLowConfidence: true,
      shouldRetranscribe: true,
      reasons,
    };
  }

  reasons.push('confidence_missing_skip_retranscribe');
  return {
    score: 0.85,
    isLowConfidence: false,
    shouldRetranscribe: false,
    reasons,
  };
}
