export type TranscriptTopic = 'game' | 'general' | 'uncertain';
export type TopicClassificationReason =
  | 'game-term-match'
  | 'game-context-continuation'
  | 'stream-title-match'
  | 'general-conversation-signal'
  | 'personal-story-signal'
  | 'recent-topic-state'
  | 'ambiguous-pronoun'
  | 'insufficient-evidence'
  | 'fallback';

export type TopicClassificationResult = {
  topic: TranscriptTopic;
  confidence: number; // 0-1
  gameScore: number;
  generalScore: number;
  reasons: TopicClassificationReason[];
  matchedGameTerms: string[];
  matchedGeneralSignals: string[];
};

export type ActiveTopicState = {
  currentTopic: TranscriptTopic;
  confidence: number;
  consecutiveGameSegments: number;
  consecutiveGeneralSegments: number;
  lastUpdatedAt: number;
};

export type TranslationRoute = 'game-aware' | 'general' | 'conservative';

export type TopicClassificationInput = {
  currentText: string;
  correctedText?: string;
  previousSegments: Array<{ text: string; topic?: TranscriptTopic }>;
  streamContext?: { gameName?: string; streamTitle?: string; channelName?: string };
  gameContext?: { gameId: string | null; displayName?: string; confidence: number };
  gameProfile?: import('../game-context/types.js').GameTranslationProfile;
  activeTopicState?: ActiveTopicState;
};

export type ProcessedTranscriptSegment = {
  text: string;
  topic: TranscriptTopic;
  route: TranslationRoute;
  at: number;
};

export type TopicContextHistory = {
  gameSegments: ProcessedTranscriptSegment[];
  generalSegments: ProcessedTranscriptSegment[];
  recentMixedSegments: ProcessedTranscriptSegment[];
};
