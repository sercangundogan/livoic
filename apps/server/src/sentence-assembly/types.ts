import type { TranscriptTopic } from '../topic-routing/types.js';

export type { TranscriptTopic };

export type UtteranceCompleteness = 'complete' | 'incomplete' | 'uncertain';

export type SentenceCompletenessReason =
  | 'terminal-punctuation'
  | 'continuation-punctuation'
  | 'trailing-conjunction'
  | 'trailing-preposition'
  | 'trailing-auxiliary'
  | 'incomplete-clause-pattern'
  | 'short-fragment'
  | 'complete-clause-pattern'
  | 'long-silence'
  | 'short-silence'
  | 'stt-finalization-artifact'
  | 'maximum-length-reached'
  | 'insufficient-evidence';

export type RawTranscriptSegment = {
  segmentId: string;
  text: string;
  startMs?: number;
  endMs?: number;
  confidence?: number;
  language?: string;
};

export type PendingUtterance = {
  id: string;
  sessionId: string;
  segments: RawTranscriptSegment[];
  combinedText: string;
  startMs: number;
  endMs: number;
  createdAt: number;
  updatedAt: number;
  preliminaryTopic: TranscriptTopic;
  completeness: UtteranceCompleteness;
  mergeCount: number;
  holdGeneration: number;
};

export type SentenceCompletenessInput = {
  segment: RawTranscriptSegment;
  text: string;
  previousPending?: PendingUtterance;
  preliminaryTopic: TranscriptTopic;
  recentSegments: Array<{ text: string; topic?: TranscriptTopic }>;
  timing?: {
    previousEndMs?: number;
    currentStartMs: number;
    currentEndMs: number;
  };
};

export type SentenceCompletenessResult = {
  completeness: UtteranceCompleteness;
  score: number;
  reasons: SentenceCompletenessReason[];
  shouldHold: boolean;
  recommendedWaitMs: number;
  isFillerOnly?: boolean;
};

export type PendingFlushReason =
  | 'sentence-complete'
  | 'timeout'
  | 'topic-change'
  | 'maximum-segments'
  | 'maximum-duration'
  | 'maximum-words'
  | 'maximum-characters'
  | 'session-stop'
  | 'game-change'
  | 'restart'
  | 'discourse-reset'
  | 'disabled';

export type AssembledUtterance = {
  id: string;
  sessionId: string;
  sourceSegmentIds: string[];
  rawText: string;
  startMs: number;
  endMs: number;
  preliminaryTopics: TranscriptTopic[];
  flushReason: PendingFlushReason;
  mergeCount: number;
};

export type FragmentMergeReason =
  | 'previous-incomplete'
  | 'short-time-gap'
  | 'same-topic'
  | 'uncertain-topic-continuation'
  | 'lowercase-continuation'
  | 'sentence-fragment-continuation'
  | 'broken-word-continuation'
  | 'topic-conflict'
  | 'long-time-gap'
  | 'maximum-limit'
  | 'restart-marker'
  | 'discourse-reset'
  | 'previous-complete';

export type FragmentMergeDecision = {
  shouldMerge: boolean;
  score: number;
  reasons: FragmentMergeReason[];
};

export type FragmentMergeInput = {
  pending: PendingUtterance;
  next: RawTranscriptSegment;
  nextTopic: TranscriptTopic;
  gapMs: number;
  mergeThreshold: number;
  shortGapMs: number;
  hardGapMs: number;
};

export type PhraseBoundaryOptions = {
  maxCharacters: number;
  maxWords: number;
  protectedTerms?: string[];
};

export type PhraseBoundaryResult = {
  left: string;
  right: string;
  splitIndex: number;
};

export type HandleFinalSegmentResult = {
  action: 'held' | 'flushed' | 'discarded';
  assembled?: AssembledUtterance;
  completeness?: SentenceCompletenessResult;
  merge?: FragmentMergeDecision;
};
