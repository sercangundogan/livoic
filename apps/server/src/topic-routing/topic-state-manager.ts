import type { TopicRoutingRuntimeConfig } from './config.js';
import { TOPIC_CLASSIFIER_CONFIG } from './config.js';
import type {
  ActiveTopicState,
  TopicClassificationResult,
  TranscriptTopic,
} from './types.js';

function initialState(): ActiveTopicState {
  return {
    currentTopic: 'uncertain',
    confidence: 0,
    consecutiveGameSegments: 0,
    consecutiveGeneralSegments: 0,
    lastUpdatedAt: Date.now(),
  };
}

export class TopicStateManager {
  private state: ActiveTopicState;

  constructor(private readonly config: TopicRoutingRuntimeConfig) {
    this.state = initialState();
  }

  getState(): ActiveTopicState {
    return { ...this.state };
  }

  update(classification: TopicClassificationResult): ActiveTopicState {
    const now = Date.now();
    const { topic, confidence } = classification;

    if (topic === 'game') {
      this.state.consecutiveGameSegments += 1;
      this.state.consecutiveGeneralSegments = 0;
      if (this.state.consecutiveGameSegments >= this.config.gameSwitchSegments) {
        this.state.currentTopic = 'game';
        this.state.confidence = confidence;
      } else if (this.state.currentTopic === 'game') {
        this.state.confidence = confidence;
      }
    } else if (topic === 'general') {
      this.state.consecutiveGeneralSegments += 1;
      this.state.consecutiveGameSegments = 0;

      const switchingFromGame = this.state.currentTopic === 'game';
      const canSwitch =
        !switchingFromGame ||
        this.state.consecutiveGeneralSegments >= this.config.generalSwitchSegments;

      if (canSwitch) {
        this.state.currentTopic = 'general';
        this.state.confidence = confidence;
      }
    } else {
      // Uncertain: do not flip currentTopic; decay consecutive switch counters
      this.state.consecutiveGameSegments = 0;
      this.state.consecutiveGeneralSegments = 0;
      // Soft-update confidence when inheriting
      if (this.state.currentTopic !== 'uncertain') {
        this.state.confidence = Math.min(this.state.confidence, confidence);
      }
    }

    this.state.lastUpdatedAt = now;
    return this.getState();
  }

  /**
   * Effective topic used for routing inheritance when classification is uncertain.
   */
  inheritTopicForUncertain(classification: TopicClassificationResult): TranscriptTopic {
    if (classification.topic !== 'uncertain') {
      return classification.topic;
    }

    const floor = TOPIC_CLASSIFIER_CONFIG.inheritanceConfidenceFloor;
    if (
      this.state.currentTopic === 'general' &&
      this.state.confidence >= floor
    ) {
      return 'general';
    }
    if (this.state.currentTopic === 'game' && this.state.confidence >= floor) {
      return 'game';
    }
    return 'uncertain';
  }

  clear(): void {
    this.state = initialState();
  }

  resetForGameChange(): void {
    this.state = initialState();
  }
}
