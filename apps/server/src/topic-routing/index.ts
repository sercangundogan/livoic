export type {
  TranscriptTopic,
  TopicClassificationReason,
  TopicClassificationResult,
  ActiveTopicState,
  TranslationRoute,
  TopicClassificationInput,
  ProcessedTranscriptSegment,
  TopicContextHistory,
} from './types.js';

export {
  TOPIC_CLASSIFIER_CONFIG,
  loadTopicRoutingConfig,
  type TopicRoutingRuntimeConfig,
} from './config.js';

export {
  DeterministicTopicClassifier,
  createTopicClassifier,
  type TopicClassifier,
} from './topic-classifier.js';

export {
  matchGameSignals,
  matchGeneralSignals,
  indexGameTerms,
  GENERAL_CONVERSATION_SIGNALS,
  STRONG_PERSONAL_SIGNALS,
  PERSONAL_STORY_PATTERNS,
} from './topic-signal-matcher.js';

export { TopicStateManager } from './topic-state-manager.js';
export { TopicContextHistoryStore } from './topic-context-history.js';

export {
  TopicRoutingService,
  buildGeneralTranslationPrompt,
  buildConservativeTranslationPrompt,
  assertNoGameContextInGeneralRoute,
} from './topic-routing.service.js';

export { normalizeForRoute } from './route-normalizer.js';
export { normalizeGeneralTranscript } from './general-normalizer.js';
export { normalizeConservativeTranscript } from './conservative-normalizer.js';
export { RoutedTranslationMemory } from './routed-translation-memory.js';
