import type { GameTranslationProfile } from '../game-context/types.js';
import { hasWordBoundaryMatch } from './topic-signal-matcher.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Conservative normalizer: only apply phonetic aliases when `from` matches AND
 * at least one other preserve term / alias `to` is already evidenced in the segment.
 * Never apply serious→Sirus on "This is serious" alone.
 */
export function normalizeConservativeTranscript(
  text: string,
  profile?: GameTranslationProfile,
): { text: string; appliedAliases: string[] } {
  if (!text || !profile?.phoneticAliases?.length) {
    return { text, appliedAliases: [] };
  }

  const evidenceTerms = collectEvidenceTerms(profile);
  let result = text;
  const appliedAliases: string[] = [];

  for (const alias of profile.phoneticAliases) {
    const from = alias.from.trim();
    const to = alias.to.trim();
    if (!from || !to) continue;
    if (from.toLowerCase() === to.toLowerCase()) continue;
    if (!hasWordBoundaryMatch(result, from)) continue;

    // requireAnyContext from profile must still be satisfied when present
    if (alias.requireAnyContext?.length) {
      const ok = alias.requireAnyContext.some((token) => hasWordBoundaryMatch(result, token));
      if (!ok) continue;
    }
    if (alias.forbidAnyContext?.length) {
      const forbidden = alias.forbidAnyContext.some((token) =>
        hasWordBoundaryMatch(result, token),
      );
      if (forbidden) continue;
    }

    // Extra safety: another preserve / canonical term (not this `from`) must already appear
    const hasOtherEvidence = evidenceTerms.some((term) => {
      if (term.toLowerCase() === from.toLowerCase()) return false;
      if (term.toLowerCase() === to.toLowerCase()) {
        // Target already present counts as evidence only if something else also matches
        return hasWordBoundaryMatch(result, term);
      }
      return hasWordBoundaryMatch(result, term);
    });

    // Count evidence excluding the alias `from` itself and requiring a distinct game token
    const distinctEvidence = evidenceTerms.filter((term) => {
      const lower = term.toLowerCase();
      return lower !== from.toLowerCase() && hasWordBoundaryMatch(result, term);
    });

    if (!hasOtherEvidence && distinctEvidence.length === 0) continue;
    if (distinctEvidence.length === 0) continue;

    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
    const next = result.replace(re, to);
    if (next !== result) {
      result = next;
      appliedAliases.push(`${from}→${to}`);
    }
  }

  return { text: result, appliedAliases };
}

function collectEvidenceTerms(profile: GameTranslationProfile): string[] {
  const terms = new Set<string>();
  for (const t of profile.preserveTerms) terms.add(t);
  for (const key of Object.keys(profile.preferredTranslations)) terms.add(key);
  for (const ct of profile.contextualTerms) {
    terms.add(ct.term);
    for (const a of ct.aliases ?? []) terms.add(a);
  }
  for (const alias of profile.phoneticAliases ?? []) {
    terms.add(alias.to);
  }
  return [...terms];
}
