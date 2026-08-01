export const TOPIC_CLASSIFIER_CONFIG = {
  exactGameTermWeight: 3,
  gameAliasWeight: 2,
  streamTitleTermWeight: 2,
  recentGameTopicWeight: 1.5,
  weakCombatTermWeight: 1,

  explicitPersonalSignalWeight: 3,
  generalConversationSignalWeight: 2,
  recentGeneralTopicWeight: 1.5,

  gameThreshold: 3,
  generalThreshold: 3,
  minimumMargin: 1.5,

  /** Minimum confidence on active topic to inherit for uncertain segments. */
  inheritanceConfidenceFloor: 0.35,
} as const;

export type TopicRoutingRuntimeConfig = {
  enabled: boolean;
  gameThreshold: number;
  generalThreshold: number;
  minimumMargin: number;
  generalSwitchSegments: number;
  gameSwitchSegments: number;
  contextGameSegments: number;
  contextGeneralSegments: number;
  contextMixedSegments: number;
  classifierLlmFallbackEnabled: boolean;
  weights: typeof TOPIC_CLASSIFIER_CONFIG;
};

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value === 'true' || value === '1';
}

function parseBoolDefaultTrue(value: string | undefined): boolean {
  if (value === undefined || value === '') return true;
  return value !== 'false' && value !== '0';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

export function loadTopicRoutingConfig(
  env: NodeJS.ProcessEnv = process.env,
): TopicRoutingRuntimeConfig {
  return {
    enabled: parseBoolDefaultTrue(env.TOPIC_ROUTING_ENABLED),
    gameThreshold: parseNumber(env.TOPIC_GAME_THRESHOLD, TOPIC_CLASSIFIER_CONFIG.gameThreshold),
    generalThreshold: parseNumber(
      env.TOPIC_GENERAL_THRESHOLD,
      TOPIC_CLASSIFIER_CONFIG.generalThreshold,
    ),
    minimumMargin: parseNumber(env.TOPIC_MINIMUM_MARGIN, TOPIC_CLASSIFIER_CONFIG.minimumMargin),
    generalSwitchSegments: parseNumber(env.TOPIC_GENERAL_SWITCH_SEGMENTS, 2),
    gameSwitchSegments: parseNumber(env.TOPIC_GAME_SWITCH_SEGMENTS, 1),
    contextGameSegments: parseNumber(env.TOPIC_CONTEXT_GAME_SEGMENTS, 5),
    contextGeneralSegments: parseNumber(env.TOPIC_CONTEXT_GENERAL_SEGMENTS, 5),
    contextMixedSegments: parseNumber(env.TOPIC_CONTEXT_MIXED_SEGMENTS, 3),
    classifierLlmFallbackEnabled: parseBool(env.TOPIC_CLASSIFIER_LLM_FALLBACK_ENABLED, false),
    weights: TOPIC_CLASSIFIER_CONFIG,
  };
}
