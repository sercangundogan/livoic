import type { TranslationInput } from '../translation/translation-provider.js';
import type { ActiveTopicState, TopicClassificationResult, TranslationRoute } from './types.js';
import { TOPIC_CLASSIFIER_CONFIG } from './config.js';

export class TopicRoutingService {
  resolveRoute(
    classification: TopicClassificationResult,
    activeTopicState: ActiveTopicState,
  ): TranslationRoute {
    if (classification.topic === 'game') {
      return 'game-aware';
    }
    if (classification.topic === 'general') {
      return 'general';
    }

    // uncertain
    const floor = TOPIC_CLASSIFIER_CONFIG.inheritanceConfidenceFloor;
    if (
      activeTopicState.currentTopic === 'general' &&
      activeTopicState.confidence >= floor
    ) {
      return 'general';
    }
    if (
      activeTopicState.currentTopic === 'game' &&
      activeTopicState.confidence >= floor
    ) {
      return 'conservative';
    }
    return 'conservative';
  }
}

export function buildGeneralTranslationPrompt(
  text: string,
  previous: string[],
  targetLanguage: string,
): { system: string; user: string } {
  const lang = targetLanguage === 'tr' ? 'Turkish' : targetLanguage;
  const system = [
    `Translate the current spoken segment into natural conversational ${lang}.`,
    '',
    'Rules:',
    "- Preserve the speaker's meaning and tone.",
    `- Use natural everyday ${lang}.`,
    '- Do not add explanations.',
    '- Do not introduce gaming terminology unless it exists explicitly in the source.',
    '- Do not use game context.',
    '- Previous segments are context only and must not be translated again.',
    '- Return only the translation of the current segment.',
  ].join('\n');

  const prev = previous.slice(-5);
  const user = [
    prev.length
      ? `Previous context:\n${prev.map((p) => `- ${p}`).join('\n')}`
      : 'Previous context:\n- (none)',
    `Current segment to translate:\n${text}`,
  ].join('\n\n');

  return { system, user };
}

export function buildConservativeTranslationPrompt(
  text: string,
  previous: string[],
  targetLanguage: string,
  gameName?: string,
): { system: string; user: string } {
  const lang = targetLanguage === 'tr' ? 'Turkish' : targetLanguage;
  const gameLabel = gameName?.trim() || 'a game';
  const system = [
    `Translate the current spoken segment into natural ${lang}.`,
    '',
    `The streamer is playing ${gameLabel}, but this sentence may be unrelated to the game.`,
    '',
    'Use game terminology only when it appears explicitly or is strongly supported by recent context.',
    'Do not force a gaming interpretation.',
    'Prefer preserving ambiguity over inventing meaning.',
    '- Do not add explanations or notes.',
    '- Previous segments are context only and must not be translated again.',
    '- Return only the translation of the current segment.',
  ].join('\n');

  const prev = previous.slice(-3);
  const user = [
    prev.length
      ? `Previous context:\n${prev.map((p) => `- ${p}`).join('\n')}`
      : 'Previous context:\n- (none)',
    `Current segment to translate:\n${text}`,
  ].join('\n\n');

  return { system, user };
}

/**
 * Development/test assertion: general route translation inputs must not carry game context.
 * Throws in non-production. In production, callers should fall back to a clean general input.
 */
export function assertNoGameContextInGeneralRoute(input: TranslationInput): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const ctx = input.domainContext;
  const problems: string[] = [];

  if (!ctx) {
    problems.push('domainContext is missing');
  } else {
    if (ctx.type !== 'general') {
      problems.push(`domainContext.type must be "general" (got "${ctx.type}")`);
    }
    if (ctx.terminology && ctx.terminology.length > 0) {
      problems.push('domainContext.terminology must be empty for general route');
    }
    if (ctx.examples && ctx.examples.length > 0) {
      problems.push('domainContext.examples must be empty for general route');
    }
    // name/description may only be conversational — reject game-profile sounding fields
    if (ctx.name && /path of exile|poe|valorant|league of legends|counter-strike/i.test(ctx.name)) {
      problems.push(`domainContext.name looks game-specific: "${ctx.name}"`);
    }
    if (
      ctx.description &&
      /game|terminology|boss|build|item|phonetic/i.test(ctx.description)
    ) {
      problems.push('domainContext.description looks game-specific');
    }
  }

  // Extra gaming fields that must never appear on TranslationInput for general route
  const anyInput = input as TranslationInput & Record<string, unknown>;
  for (const key of [
    'gameId',
    'gameName',
    'gameProfile',
    'gameTerminology',
    'gameExamples',
    'phoneticAliases',
    'gameTranslationMemory',
  ]) {
    if (anyInput[key] != null) {
      problems.push(`forbidden field present: ${key}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `assertNoGameContextInGeneralRoute failed:\n- ${problems.join('\n- ')}`,
    );
  }
}
