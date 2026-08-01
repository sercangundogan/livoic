/**
 * General-route transcript normalizer.
 * MVP: identity / trivial whitespace only — MUST NOT apply game phonetic aliases.
 */
export function normalizeGeneralTranscript(text: string): {
  text: string;
  appliedAliases: string[];
} {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return { text: normalized, appliedAliases: [] };
}
