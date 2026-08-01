import { describe, expect, it } from 'vitest';
import { TopicRoutingService } from './topic-routing.service.js';
import type { ActiveTopicState, TopicClassificationResult } from './types.js';

const service = new TopicRoutingService();

function classification(
  topic: TopicClassificationResult['topic'],
  confidence = 0.8,
): TopicClassificationResult {
  return {
    topic,
    confidence,
    gameScore: topic === 'game' ? 6 : 0,
    generalScore: topic === 'general' ? 6 : 0,
    reasons: [],
    matchedGameTerms: [],
    matchedGeneralSignals: [],
  };
}

function state(
  currentTopic: ActiveTopicState['currentTopic'],
  confidence = 0.8,
): ActiveTopicState {
  return {
    currentTopic,
    confidence,
    consecutiveGameSegments: currentTopic === 'game' ? 1 : 0,
    consecutiveGeneralSegments: currentTopic === 'general' ? 1 : 0,
    lastUpdatedAt: Date.now(),
  };
}

describe('TopicRoutingService.resolveRoute', () => {
  it('maps game → game-aware', () => {
    expect(service.resolveRoute(classification('game'), state('uncertain'))).toBe('game-aware');
  });

  it('maps general → general', () => {
    expect(service.resolveRoute(classification('general'), state('game'))).toBe('general');
  });

  it('maps uncertain + recent general → general', () => {
    expect(service.resolveRoute(classification('uncertain', 0.2), state('general'))).toBe(
      'general',
    );
  });

  it('maps uncertain + recent game → conservative', () => {
    expect(service.resolveRoute(classification('uncertain', 0.2), state('game'))).toBe(
      'conservative',
    );
  });

  it('maps uncertain + no context → conservative', () => {
    expect(service.resolveRoute(classification('uncertain', 0.1), state('uncertain', 0))).toBe(
      'conservative',
    );
  });
});
