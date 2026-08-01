import type { GameTranslationProfile } from '../game-context/types.js';

export type NormalizeResult = {
  text: string;
  appliedAliases: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWordBoundaryToken(haystack: string, token: string): boolean {
  if (!token.trim()) return false;
  const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i');
  return re.test(haystack);
}

/**
 * Game-aware phonetic alias restoration from profile.phoneticAliases.
 * Word-boundary, case-insensitive replace of `from` → `to`, gated by context tokens.
 */
export function normalizeTranscript(
  text: string,
  profile?: GameTranslationProfile,
): NormalizeResult {
  if (!text || !profile?.phoneticAliases?.length) {
    return { text, appliedAliases: [] };
  }

  let result = text;
  const appliedAliases: string[] = [];

  for (const alias of profile.phoneticAliases) {
    const from = alias.from.trim();
    const to = alias.to.trim();
    if (!from || !to) continue;

    // Never replace if the source token is already the target (case-insensitive)
    if (from.toLowerCase() === to.toLowerCase()) continue;

    // Already contains the correct form as the token — skip replacing the alias source
    // when the exact target word is what we'd match... handled by from!==to above.
    // Also skip if current text already has `to` as the only form and not `from`.

    const requireAny = alias.requireAnyContext;
    const forbidAny = alias.forbidAnyContext;

    if (forbidAny?.length) {
      const forbidden = forbidAny.some((token) => hasWordBoundaryToken(result, token));
      if (forbidden) continue;
    }

    if (requireAny && requireAny.length > 0) {
      const ok = requireAny.some((token) => hasWordBoundaryToken(result, token));
      if (!ok) continue;
    }

    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
    if (!re.test(result)) continue;

    // Reset lastIndex after test()
    re.lastIndex = 0;
    const next = result.replace(re, to);
    if (next !== result) {
      result = next;
      appliedAliases.push(`${from}→${to}`);
    }
  }

  return { text: result, appliedAliases };
}
