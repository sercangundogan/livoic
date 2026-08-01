export type SentenceAssemblyRuntimeConfig = {
  enabled: boolean;
  holdMinMs: number;
  holdDefaultMs: number;
  holdUncertainMs: number;
  holdStrongIncompleteMs: number;
  holdMaxMs: number;
  shortGapMs: number;
  hardGapMs: number;
  maxSegments: number;
  maxDurationMs: number;
  maxWords: number;
  maxCharacters: number;
  mergeScoreThreshold: number;
  diagnosticsEnabled: boolean;
};

export const SENTENCE_COMPLETENESS_CONFIG = {
  trailingConjunctionWeight: 3,
  trailingPrepositionWeight: 2,
  trailingAuxiliaryWeight: 3,
  incompletePatternWeight: 3,
  shortFragmentWeight: 2,
  continuationPunctuationWeight: 2,

  terminalPunctuationWeight: -3,
  completeClauseWeight: -2,
  longSilenceWeight: -3,

  incompleteThreshold: 3,
  completeThreshold: -2,
} as const;

export const SENTENCE_ASSEMBLY_CONFIG = {
  minimumHoldMs: 250,
  defaultHoldMs: 650,
  uncertainHoldMs: 450,
  strongIncompleteHoldMs: 1000,
  maximumHoldMs: 1200,
  shortGapThresholdMs: 700,
  hardGapLimitMs: 1500,
} as const;

export const PENDING_UTTERANCE_LIMITS = {
  maximumSegments: 3,
  maximumDurationMs: 10_000,
  maximumWords: 45,
  maximumCharacters: 280,
} as const;

export const SENTENCE_MERGE_SCORE_THRESHOLD = 4;

function parseBoolDefaultTrue(value: string | undefined): boolean {
  if (value === undefined || value === '') return true;
  return value !== 'false' && value !== '0';
}

function parseBoolDefaultFalse(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  return value === 'true' || value === '1';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

export function loadSentenceAssemblyConfig(
  env: NodeJS.ProcessEnv = process.env,
): SentenceAssemblyRuntimeConfig {
  return {
    enabled: parseBoolDefaultTrue(env.SENTENCE_ASSEMBLY_ENABLED),
    holdMinMs: parseNumber(env.SENTENCE_HOLD_MIN_MS, SENTENCE_ASSEMBLY_CONFIG.minimumHoldMs),
    holdDefaultMs: parseNumber(
      env.SENTENCE_HOLD_DEFAULT_MS,
      SENTENCE_ASSEMBLY_CONFIG.defaultHoldMs,
    ),
    holdUncertainMs: parseNumber(
      env.SENTENCE_HOLD_UNCERTAIN_MS,
      SENTENCE_ASSEMBLY_CONFIG.uncertainHoldMs,
    ),
    holdStrongIncompleteMs: parseNumber(
      env.SENTENCE_HOLD_STRONG_INCOMPLETE_MS,
      SENTENCE_ASSEMBLY_CONFIG.strongIncompleteHoldMs,
    ),
    holdMaxMs: parseNumber(env.SENTENCE_HOLD_MAX_MS, SENTENCE_ASSEMBLY_CONFIG.maximumHoldMs),
    shortGapMs: parseNumber(
      env.SENTENCE_SHORT_GAP_MS,
      SENTENCE_ASSEMBLY_CONFIG.shortGapThresholdMs,
    ),
    hardGapMs: parseNumber(env.SENTENCE_HARD_GAP_MS, SENTENCE_ASSEMBLY_CONFIG.hardGapLimitMs),
    maxSegments: parseNumber(env.SENTENCE_MAX_SEGMENTS, PENDING_UTTERANCE_LIMITS.maximumSegments),
    maxDurationMs: parseNumber(
      env.SENTENCE_MAX_DURATION_MS,
      PENDING_UTTERANCE_LIMITS.maximumDurationMs,
    ),
    maxWords: parseNumber(env.SENTENCE_MAX_WORDS, PENDING_UTTERANCE_LIMITS.maximumWords),
    maxCharacters: parseNumber(
      env.SENTENCE_MAX_CHARACTERS,
      PENDING_UTTERANCE_LIMITS.maximumCharacters,
    ),
    mergeScoreThreshold: parseNumber(
      env.SENTENCE_MERGE_SCORE_THRESHOLD,
      SENTENCE_MERGE_SCORE_THRESHOLD,
    ),
    diagnosticsEnabled: parseBoolDefaultFalse(env.SENTENCE_DIAGNOSTICS_ENABLED),
  };
}
