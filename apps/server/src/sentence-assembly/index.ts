export type {
  UtteranceCompleteness,
  SentenceCompletenessReason,
  SentenceCompletenessResult,
  SentenceCompletenessInput,
  PendingUtterance,
  PendingFlushReason,
  AssembledUtterance,
  FragmentMergeReason,
  FragmentMergeDecision,
  FragmentMergeInput,
  RawTranscriptSegment,
  TranscriptTopic,
  PhraseBoundaryOptions,
  PhraseBoundaryResult,
  HandleFinalSegmentResult,
} from './types.js';

export {
  SENTENCE_COMPLETENESS_CONFIG,
  SENTENCE_ASSEMBLY_CONFIG,
  PENDING_UTTERANCE_LIMITS,
  SENTENCE_MERGE_SCORE_THRESHOLD,
  loadSentenceAssemblyConfig,
  type SentenceAssemblyRuntimeConfig,
} from './config.js';

export {
  countWords,
  isFillerOnly,
  isRestartMarker,
  isDiscourseReset,
  topicsCompatible,
  hasTerminalPunctuation,
  endsWithBrokenWord,
  startsLowercaseContinuation,
} from './merge-policy.js';

export {
  SentenceCompletenessEvaluator,
} from './completeness-evaluator.js';

export { FragmentMerger, combineSegmentTexts, joinTexts } from './fragment-merger.js';

export { findBestSplit, PhraseBoundaryDetector } from './phrase-boundary-detector.js';

export { PendingUtteranceBuffer } from './pending-utterance-buffer.js';

export {
  SentenceAssemblyService,
  type SentenceAssemblyServiceOptions,
} from './sentence-assembly.service.js';
