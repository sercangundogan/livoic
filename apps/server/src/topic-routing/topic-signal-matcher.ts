import type { GameTranslationProfile } from '../game-context/types.js';
import { TOPIC_CLASSIFIER_CONFIG } from './config.js';
import type { TopicClassificationReason } from './types.js';

export type GameSignalMatch = {
  score: number;
  matchedTerms: string[];
  reasons: TopicClassificationReason[];
};

export type GeneralSignalMatch = {
  score: number;
  matchedSignals: string[];
  reasons: TopicClassificationReason[];
};

type IndexedTerm = {
  term: string;
  weight: number;
  kind: 'exact' | 'alias' | 'weak';
};

/** Words that must never count as game signals on their own. */
const NEVER_GAME_SIGNALS = new Set(['good', 'bad', 'thing', 'it', 'this', 'that', 'was', 'is', 'are']);

/**
 * Combat/game words that are weak alone — only count when a profile exists
 * or when combined with stronger game terms.
 */
const WEAK_COMBAT_TERMS = ['damage', 'build', 'gear', 'map', 'maps', 'builds'];

/**
 * Stronger multi-word / community phrases gated on an active game profile.
 * Used when the profile does not already list the phrase.
 */
const PROFILE_GATED_STRONG_TERMS = [
  'spell suppression',
  'clear speed',
  'res',
  'resist',
  'resistances',
];

/** Everyday conversation cues (weight: generalConversationSignalWeight). */
export const GENERAL_CONVERSATION_SIGNALS = [
  'yesterday',
  'last week',
  'my wife',
  'my husband',
  'my family',
  'my mother',
  'my father',
  'my friend',
  'my job',
  'at work',
  'school',
  'doctor',
  'dentist',
  'restaurant',
  'food',
  'sleep',
  'vacation',
  'weekend',
  'travel',
  'traveling',
  'travelling',
  'flight',
  'hotel',
  'house',
  'apartment',
  'birthday',
  'wedding',
  'money',
  'rent',
  'weather',
  'car',
  'traffic',
  'dinner',
  'visa',
  'my visa',
  'camera',
] as const;

/**
 * Strong personal-life tokens — scored with explicitPersonalSignalWeight
 * so a single clear cue can clear the general threshold.
 */
export const STRONG_PERSONAL_SIGNALS = [
  'dentist',
  'doctor',
  'visa',
  'my visa',
  'my wife',
  'my husband',
  'my family',
  'wedding',
  'birthday',
  'vacation',
] as const;

export const PERSONAL_STORY_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: 'i went', re: /\bi went\b/i },
  { id: 'i was', re: /\bi was\b/i },
  { id: 'i had', re: /\bi had\b/i },
  { id: 'i met', re: /\bi met\b/i },
  { id: 'i told', re: /\bi told\b/i },
  { id: 'i finally', re: /\bi finally\b/i },
  { id: 'when i was', re: /\bwhen i was\b/i },
  { id: 'my wife|husband|family|mother|father|friend', re: /\bmy (wife|husband|family|mother|father|friend)\b/i },
  { id: 'last week|year|night', re: /\blast (week|year|night)\b/i },
  { id: 'came home', re: /\bcame home\b/i },
  { id: 'went out', re: /\bwent out\b/i },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hasWordBoundaryMatch(haystack: string, needle: string): boolean {
  if (!needle.trim()) return false;
  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i');
  return re.test(haystack);
}

function addUnique(list: string[], term: string): void {
  const lower = term.toLowerCase();
  if (!list.some((t) => t.toLowerCase() === lower)) {
    list.push(term);
  }
}

export function indexGameTerms(profile?: GameTranslationProfile): IndexedTerm[] {
  const byLower = new Map<string, IndexedTerm>();

  const upsert = (term: string, weight: number, kind: IndexedTerm['kind']) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (NEVER_GAME_SIGNALS.has(key)) return;
    const existing = byLower.get(key);
    if (!existing || weight > existing.weight) {
      byLower.set(key, { term: trimmed, weight, kind });
    }
  };

  if (profile) {
    for (const term of profile.preserveTerms) {
      upsert(term, TOPIC_CLASSIFIER_CONFIG.exactGameTermWeight, 'exact');
    }
    for (const key of Object.keys(profile.preferredTranslations)) {
      upsert(key, TOPIC_CLASSIFIER_CONFIG.exactGameTermWeight, 'exact');
    }
    for (const ct of profile.contextualTerms) {
      upsert(ct.term, TOPIC_CLASSIFIER_CONFIG.gameAliasWeight, 'alias');
      for (const alias of ct.aliases ?? []) {
        upsert(alias, TOPIC_CLASSIFIER_CONFIG.gameAliasWeight, 'alias');
      }
    }
    for (const alias of profile.phoneticAliases ?? []) {
      // Index canonical `to` only — never treat mishearings like "serious" as game signals.
      upsert(alias.to, TOPIC_CLASSIFIER_CONFIG.exactGameTermWeight, 'exact');
    }
    for (const strong of PROFILE_GATED_STRONG_TERMS) {
      upsert(strong, TOPIC_CLASSIFIER_CONFIG.exactGameTermWeight, 'exact');
    }
    for (const weak of WEAK_COMBAT_TERMS) {
      upsert(weak, TOPIC_CLASSIFIER_CONFIG.weakCombatTermWeight, 'weak');
    }
  }

  // Prefer longer phrases first so "spell suppression" wins over fragments.
  return [...byLower.values()].sort((a, b) => b.term.length - a.term.length);
}

export function matchGameSignals(
  text: string,
  profile?: GameTranslationProfile,
  streamContext?: { gameName?: string; streamTitle?: string; channelName?: string },
): GameSignalMatch {
  const matchedTerms: string[] = [];
  const reasons = new Set<TopicClassificationReason>();
  let score = 0;

  if (!text.trim()) {
    return { score: 0, matchedTerms, reasons: [] };
  }

  const indexed = indexGameTerms(profile);
  const consumed = new Set<string>();

  for (const entry of indexed) {
    if (!hasWordBoundaryMatch(text, entry.term)) continue;
    const key = entry.term.toLowerCase();
    // Skip if a longer already-matched term covers this span roughly via substring of matched list
    if ([...consumed].some((c) => c.includes(key) || key.includes(c))) {
      // Still allow non-overlapping distinct terms; only skip exact duplicate key
      if (consumed.has(key)) continue;
    }
    if (consumed.has(key)) continue;
    consumed.add(key);

    if (entry.kind === 'weak') {
      // Weak terms only count when a profile exists (already gated by index) —
      // they contribute their low weight; classifier threshold prevents alone-wins.
      score += entry.weight;
      addUnique(matchedTerms, entry.term);
      reasons.add('game-term-match');
      continue;
    }

    score += entry.weight;
    addUnique(matchedTerms, entry.term);
    reasons.add('game-term-match');
  }

  // Stream title / game name overlap with matched profile terms
  const titleBlob = [streamContext?.streamTitle, streamContext?.gameName]
    .filter(Boolean)
    .join(' ');
  if (titleBlob && profile) {
    for (const entry of indexed) {
      if (entry.kind === 'weak') continue;
      if (!hasWordBoundaryMatch(titleBlob, entry.term)) continue;
      if (!hasWordBoundaryMatch(text, entry.term)) continue;
      score += TOPIC_CLASSIFIER_CONFIG.streamTitleTermWeight;
      addUnique(matchedTerms, entry.term);
      reasons.add('stream-title-match');
      break;
    }
  }

  return { score, matchedTerms, reasons: [...reasons] };
}

export function matchGeneralSignals(text: string): GeneralSignalMatch {
  const matchedSignals: string[] = [];
  const reasons = new Set<TopicClassificationReason>();
  let score = 0;

  if (!text.trim()) {
    return { score: 0, matchedSignals, reasons: [] };
  }

  // Longer phrases first
  const signals = [...GENERAL_CONVERSATION_SIGNALS].sort((a, b) => b.length - a.length);
  const strongPersonal = new Set(STRONG_PERSONAL_SIGNALS.map((s) => s.toLowerCase()));
  const consumed = new Set<string>();

  for (const signal of signals) {
    if (!hasWordBoundaryMatch(text, signal)) continue;
    const key = signal.toLowerCase();
    if (consumed.has(key)) continue;
    // Skip shorter overlaps already covered (e.g. "visa" after "my visa")
    if ([...consumed].some((c) => c.includes(key) || key.includes(c))) {
      if ([...consumed].some((c) => c.includes(key))) continue;
    }
    consumed.add(key);
    const weight = strongPersonal.has(key)
      ? TOPIC_CLASSIFIER_CONFIG.explicitPersonalSignalWeight
      : TOPIC_CLASSIFIER_CONFIG.generalConversationSignalWeight;
    score += weight;
    addUnique(matchedSignals, signal);
    reasons.add('general-conversation-signal');
  }

  for (const pattern of PERSONAL_STORY_PATTERNS) {
    if (!pattern.re.test(text)) continue;
    // First-person alone is not enough: require a conversation/personal signal
    // OR a storytelling pattern that is not bare "I need..." game speak.
    const isBareFirstPerson = /^(i went|i was|i had|i met|i told|i finally)$/i.test(pattern.id);
    const hasConversationSignal = matchedSignals.length > 0;
    const isStrongStory =
      pattern.id.startsWith('my ') ||
      pattern.id.startsWith('last ') ||
      pattern.id === 'when i was' ||
      pattern.id === 'came home' ||
      pattern.id === 'went out';

    if (isBareFirstPerson && !hasConversationSignal && !isStrongStory) {
      continue;
    }
    if (isBareFirstPerson && !hasConversationSignal) {
      continue;
    }

    score += TOPIC_CLASSIFIER_CONFIG.explicitPersonalSignalWeight;
    addUnique(matchedSignals, pattern.id);
    reasons.add('personal-story-signal');
  }

  return { score, matchedSignals, reasons: [...reasons] };
}
