import {
  SENTENCE_ASSEMBLY_CONFIG,
  SENTENCE_COMPLETENESS_CONFIG,
  type SentenceAssemblyRuntimeConfig,
} from './config.js';
import { countWords, hasTerminalPunctuation, isFillerOnly } from './merge-policy.js';
import type {
  SentenceCompletenessInput,
  SentenceCompletenessReason,
  SentenceCompletenessResult,
  UtteranceCompleteness,
} from './types.js';

const TRAILING_CONJUNCTIONS = [
  'and',
  'but',
  'because',
  'so',
  'or',
  'although',
  'though',
  'while',
  'unless',
  'if',
  'when',
  'then',
] as const;

const TRAILING_PREPOSITIONS = [
  'with',
  'for',
  'to',
  'from',
  'on',
  'in',
  'at',
  'about',
  'of',
  'into',
  'onto',
  'over',
  'under',
  'by',
  'as',
] as const;

const MULTI_WORD_TRAILING_PREPS = ['because of', 'instead of', 'out of', 'due to'] as const;

const INCOMPLETE_PATTERNS: RegExp[] = [
  /I think we should$/i,
  /You probably need to$/i,
  /This build can$/i,
  /It might be$/i,
  /The reason is$/i,
  /What I mean is$/i,
  /It depends on$/i,
  /I'm trying to$/i,
  /I am trying to$/i,
  /We have to$/i,
  /The problem with .+ is$/i,
  /the problem is$/i,
  /for example$/i,
  /and then$/i,
  /I mean$/i,
  /it should$/i,
  /probably on$/i,
  /needs?$/i,
];

const SUBJECT_ISH =
  /^(i|we|you|they|he|she|it|this|that|these|those|the|my|our|your|their|a|an)\b/i;
const VERB_ISH =
  /\b(am|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|can|could|should|shall|may|might|must|need|needs|got|get|go|goes|went|kill|killed|think|thought|want|wanted|seem|seems|look|looks|feel|feels|make|made|take|took|come|came|say|said|know|knew)\b/i;

function lastToken(text: string): string {
  const cleaned = text.trim().replace(/[,…—\-:]+$/u, '').trim();
  const parts = cleaned.split(/\s+/);
  return (parts[parts.length - 1] ?? '').toLowerCase().replace(/[^a-z']/gi, '');
}

function endsWithAnyWord(text: string, words: readonly string[]): boolean {
  const token = lastToken(text);
  return words.includes(token);
}

function endsWithMultiWord(text: string, phrases: readonly string[]): boolean {
  const normalized = text
    .trim()
    .replace(/[,…—\-:]+$/u, '')
    .trim()
    .toLowerCase();
  return phrases.some((p) => normalized.endsWith(p));
}

function hasContinuationPunctuation(text: string): boolean {
  return /[,…—\-:]\s*$/u.test(text.trim());
}

function matchesIncompletePattern(text: string): boolean {
  const trimmed = text.trim().replace(/[,…—\-:]+$/u, '').trim();
  return INCOMPLETE_PATTERNS.some((re) => re.test(trimmed));
}

function looksLikeCompleteClause(text: string): boolean {
  const trimmed = text.trim();
  if (hasContinuationPunctuation(trimmed)) return false;
  if (endsWithAnyWord(trimmed, TRAILING_CONJUNCTIONS)) return false;
  if (endsWithAnyWord(trimmed, TRAILING_PREPOSITIONS)) return false;
  if (endsWithMultiWord(trimmed, MULTI_WORD_TRAILING_PREPS)) return false;
  if (matchesIncompletePattern(trimmed)) return false;

  const words = countWords(trimmed);
  if (words < 4) return false;

  const hasSubject = SUBJECT_ISH.test(trimmed);
  const hasVerb = VERB_ISH.test(trimmed);
  return hasSubject && hasVerb;
}

function resolveCompleteness(score: number): UtteranceCompleteness {
  if (score >= SENTENCE_COMPLETENESS_CONFIG.incompleteThreshold) return 'incomplete';
  if (score <= SENTENCE_COMPLETENESS_CONFIG.completeThreshold) return 'complete';
  return 'uncertain';
}

function clampHoldMs(ms: number, config: SentenceAssemblyRuntimeConfig): number {
  return Math.min(config.holdMaxMs, Math.max(config.holdMinMs, ms));
}

function recommendedWait(
  completeness: UtteranceCompleteness,
  score: number,
  config: SentenceAssemblyRuntimeConfig,
): number {
  if (completeness === 'complete') return 0;

  let wait = config.holdDefaultMs;
  if (completeness === 'uncertain') {
    wait = config.holdUncertainMs;
  } else if (score >= SENTENCE_COMPLETENESS_CONFIG.incompleteThreshold + 2) {
    wait = config.holdStrongIncompleteMs;
  } else {
    wait = config.holdDefaultMs;
  }

  return clampHoldMs(wait, config);
}

export class SentenceCompletenessEvaluator {
  constructor(
    private readonly holdConfig: Pick<
      SentenceAssemblyRuntimeConfig,
      | 'holdMinMs'
      | 'holdDefaultMs'
      | 'holdUncertainMs'
      | 'holdStrongIncompleteMs'
      | 'holdMaxMs'
    > = {
      holdMinMs: SENTENCE_ASSEMBLY_CONFIG.minimumHoldMs,
      holdDefaultMs: SENTENCE_ASSEMBLY_CONFIG.defaultHoldMs,
      holdUncertainMs: SENTENCE_ASSEMBLY_CONFIG.uncertainHoldMs,
      holdStrongIncompleteMs: SENTENCE_ASSEMBLY_CONFIG.strongIncompleteHoldMs,
      holdMaxMs: SENTENCE_ASSEMBLY_CONFIG.maximumHoldMs,
    },
  ) {}

  evaluate(input: SentenceCompletenessInput): SentenceCompletenessResult {
    const text = input.text.trim();
    const reasons: SentenceCompletenessReason[] = [];
    let score = 0;

    const filler = isFillerOnly(text);
    if (filler) {
      score += SENTENCE_COMPLETENESS_CONFIG.shortFragmentWeight;
      reasons.push('short-fragment');
      const completeness: UtteranceCompleteness = 'incomplete';
      const shouldHold = true;
      return {
        completeness,
        score,
        reasons,
        shouldHold,
        recommendedWaitMs: recommendedWait(completeness, score, this.holdConfig as SentenceAssemblyRuntimeConfig),
        isFillerOnly: true,
      };
    }

    if (hasContinuationPunctuation(text)) {
      score += SENTENCE_COMPLETENESS_CONFIG.continuationPunctuationWeight;
      reasons.push('continuation-punctuation');
    }

    if (endsWithAnyWord(text, TRAILING_CONJUNCTIONS)) {
      score += SENTENCE_COMPLETENESS_CONFIG.trailingConjunctionWeight;
      reasons.push('trailing-conjunction');
    }

    if (
      endsWithMultiWord(text, MULTI_WORD_TRAILING_PREPS) ||
      endsWithAnyWord(text, TRAILING_PREPOSITIONS)
    ) {
      score += SENTENCE_COMPLETENESS_CONFIG.trailingPrepositionWeight;
      reasons.push('trailing-preposition');
    }

    if (matchesIncompletePattern(text)) {
      // Prefer auxiliary vs generic incomplete-clause based on pattern shape
      const withoutPunct = text.replace(/[,…—\-:]+$/u, '').trim();
      const auxiliaryLike =
        /should$|need to$|can$|might be$|have to$|trying to$|depends on$/i.test(withoutPunct);
      if (auxiliaryLike) {
        score += SENTENCE_COMPLETENESS_CONFIG.trailingAuxiliaryWeight;
        reasons.push('trailing-auxiliary');
      } else {
        score += SENTENCE_COMPLETENESS_CONFIG.incompletePatternWeight;
        reasons.push('incomplete-clause-pattern');
      }
    }

    const wordCount = countWords(text);
    const isShortFragment =
      wordCount > 0 && wordCount < 5 && !hasTerminalPunctuation(text);
    if (isShortFragment) {
      score += SENTENCE_COMPLETENESS_CONFIG.shortFragmentWeight;
      reasons.push('short-fragment');
    }

    if (hasTerminalPunctuation(text)) {
      score += SENTENCE_COMPLETENESS_CONFIG.terminalPunctuationWeight;
      reasons.push('terminal-punctuation');
    }

    // Avoid treating short/truncated clauses as complete (e.g. "I think this build").
    if (!isShortFragment && looksLikeCompleteClause(text)) {
      score += SENTENCE_COMPLETENESS_CONFIG.completeClauseWeight;
      reasons.push('complete-clause-pattern');
    }

    if (input.timing?.previousEndMs != null) {
      const gap = input.timing.currentStartMs - input.timing.previousEndMs;
      if (gap >= SENTENCE_ASSEMBLY_CONFIG.hardGapLimitMs) {
        score += SENTENCE_COMPLETENESS_CONFIG.longSilenceWeight;
        reasons.push('long-silence');
      } else if (gap >= 0 && gap <= SENTENCE_ASSEMBLY_CONFIG.shortGapThresholdMs) {
        reasons.push('short-silence');
      }
    }

    if (reasons.length === 0) {
      reasons.push('insufficient-evidence');
    }

    const completeness = resolveCompleteness(score);
    const shouldHold =
      completeness === 'incomplete' || (completeness === 'uncertain' && score > 0);

    return {
      completeness,
      score,
      reasons,
      shouldHold,
      recommendedWaitMs: shouldHold
        ? recommendedWait(completeness, score, this.holdConfig as SentenceAssemblyRuntimeConfig)
        : 0,
      isFillerOnly: false,
    };
  }
}
