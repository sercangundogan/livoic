import { TOPIC_CLASSIFIER_CONFIG, type TopicRoutingRuntimeConfig, loadTopicRoutingConfig } from './config.js';
import { matchGameSignals, matchGeneralSignals } from './topic-signal-matcher.js';
import type {
  TopicClassificationInput,
  TopicClassificationReason,
  TopicClassificationResult,
  TranscriptTopic,
} from './types.js';

export interface TopicClassifier {
  classify(input: TopicClassificationInput): TopicClassificationResult;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function uniqueReasons(reasons: TopicClassificationReason[]): TopicClassificationReason[] {
  return [...new Set(reasons)];
}

export class DeterministicTopicClassifier implements TopicClassifier {
  constructor(private readonly config: TopicRoutingRuntimeConfig = loadTopicRoutingConfig()) {}

  classify(input: TopicClassificationInput): TopicClassificationResult {
    const text = (input.correctedText ?? input.currentText).trim();
    const weights = this.config.weights;
    const reasons: TopicClassificationReason[] = [];
    const matchedGameTerms: string[] = [];
    const matchedGeneralSignals: string[] = [];

    if (!text) {
      return {
        topic: 'uncertain',
        confidence: 0,
        gameScore: 0,
        generalScore: 0,
        reasons: ['insufficient-evidence'],
        matchedGameTerms: [],
        matchedGeneralSignals: [],
      };
    }

    const gameMatch = matchGameSignals(text, input.gameProfile, input.streamContext);
    let gameScore = gameMatch.score;
    matchedGameTerms.push(...gameMatch.matchedTerms);
    reasons.push(...gameMatch.reasons);

    const generalMatch = matchGeneralSignals(text);
    let generalScore = generalMatch.score;
    matchedGeneralSignals.push(...generalMatch.matchedSignals);
    reasons.push(...generalMatch.reasons);

    // Active topic continuation
    const active = input.activeTopicState;
    if (active?.currentTopic === 'game' && active.confidence >= weights.inheritanceConfidenceFloor) {
      gameScore += weights.recentGameTopicWeight;
      reasons.push('recent-topic-state');
    } else if (
      active?.currentTopic === 'general' &&
      active.confidence >= weights.inheritanceConfidenceFloor
    ) {
      generalScore += weights.recentGeneralTopicWeight;
      reasons.push('recent-topic-state');
    }

    // Previous segment continuation (look at recent tagged segments)
    const recent = input.previousSegments.slice(-3);
    const recentGame = recent.filter((s) => s.topic === 'game').length;
    const recentGeneral = recent.filter((s) => s.topic === 'general').length;
    if (recentGame > 0 && recentGame >= recentGeneral) {
      gameScore += weights.recentGameTopicWeight * Math.min(recentGame, 2) * 0.5;
      reasons.push('game-context-continuation');
    } else if (recentGeneral > 0 && recentGeneral > recentGame) {
      generalScore += weights.recentGeneralTopicWeight * Math.min(recentGeneral, 2) * 0.5;
      reasons.push('recent-topic-state');
    }

    // Ambiguous pronoun-heavy short utterances with little evidence
    if (
      /\b(it|that|this|they)\b/i.test(text) &&
      text.split(/\s+/).length <= 6 &&
      gameScore < weights.exactGameTermWeight &&
      generalScore < weights.explicitPersonalSignalWeight
    ) {
      reasons.push('ambiguous-pronoun');
    }

    gameScore = clampScore(gameScore);
    generalScore = clampScore(generalScore);

    const gameThreshold = this.config.gameThreshold;
    const generalThreshold = this.config.generalThreshold;
    const minimumMargin = this.config.minimumMargin;

    let topic: TranscriptTopic = 'uncertain';
    if (gameScore >= gameThreshold && gameScore - generalScore >= minimumMargin) {
      topic = 'game';
    } else if (
      generalScore >= generalThreshold &&
      generalScore - gameScore >= minimumMargin
    ) {
      topic = 'general';
    } else {
      if (gameScore < gameThreshold && generalScore < generalThreshold) {
        reasons.push('insufficient-evidence');
      }
      topic = 'uncertain';
    }

    const margin = Math.abs(gameScore - generalScore);
    const denom = gameScore + generalScore + 1e-6;
    const confidence = Math.max(0, Math.min(1, margin / denom));

    const finalReasons = uniqueReasons(reasons);
    if (finalReasons.length === 0) {
      finalReasons.push('fallback');
    }

    return {
      topic,
      confidence: topic === 'uncertain' ? Math.min(confidence, 0.45) : Math.max(confidence, 0.5),
      gameScore,
      generalScore,
      reasons: finalReasons,
      matchedGameTerms,
      matchedGeneralSignals,
    };
  }
}

/** Convenience factory using process env defaults. */
export function createTopicClassifier(
  config?: TopicRoutingRuntimeConfig,
): DeterministicTopicClassifier {
  return new DeterministicTopicClassifier(config ?? loadTopicRoutingConfig());
}

// Re-export config constant for callers that need weight introspection
export { TOPIC_CLASSIFIER_CONFIG };
