import { normalizeTranscript } from '../transcript-correction/transcript-normalizer.js';
import type { GameTranslationProfile } from '../game-context/types.js';
import { normalizeConservativeTranscript } from './conservative-normalizer.js';
import { normalizeGeneralTranscript } from './general-normalizer.js';
import type { TranslationRoute } from './types.js';

export function normalizeForRoute(
  text: string,
  route: TranslationRoute,
  profile?: GameTranslationProfile,
): { text: string; appliedAliases: string[]; normalizeLatencyMs: number } {
  const started = Date.now();
  let result: { text: string; appliedAliases: string[] };
  if (route === 'general') {
    result = normalizeGeneralTranscript(text);
  } else if (route === 'conservative') {
    result = normalizeConservativeTranscript(text, profile);
  } else {
    result = normalizeTranscript(text, profile);
  }
  return { ...result, normalizeLatencyMs: Date.now() - started };
}
