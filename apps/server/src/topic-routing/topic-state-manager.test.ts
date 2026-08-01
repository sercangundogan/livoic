import { describe, expect, it } from 'vitest';
import { loadTopicRoutingConfig } from './config.js';
import { DeterministicTopicClassifier } from './topic-classifier.js';
import { TopicStateManager } from './topic-state-manager.js';
import { TopicRoutingService } from './topic-routing.service.js';
import { GameProfileLoader } from '../game-context/game-profile.loader.js';
import type { TopicClassificationResult } from './types.js';

const config = loadTopicRoutingConfig({});
const classifier = new DeterministicTopicClassifier(config);
const poe = new GameProfileLoader().get('path-of-exile')!;

function makeResult(
  partial: Partial<TopicClassificationResult> & Pick<TopicClassificationResult, 'topic'>,
): TopicClassificationResult {
  return {
    confidence: 0.8,
    gameScore: partial.topic === 'game' ? 6 : 0,
    generalScore: partial.topic === 'general' ? 6 : 0,
    reasons: [],
    matchedGameTerms: [],
    matchedGeneralSignals: [],
    ...partial,
  };
}

describe('TopicStateManager', () => {
  it('switches to game immediately on strong game', () => {
    const mgr = new TopicStateManager(config);
    mgr.update(makeResult({ topic: 'general', generalScore: 6 }));
    expect(mgr.getState().currentTopic).toBe('general');

    mgr.update(makeResult({ topic: 'game', gameScore: 8 }));
    expect(mgr.getState().currentTopic).toBe('game');
    expect(mgr.getState().consecutiveGameSegments).toBe(1);
  });

  it('requires consecutive general segments to leave game', () => {
    const mgr = new TopicStateManager(config);
    mgr.update(makeResult({ topic: 'game', gameScore: 8 }));
    expect(mgr.getState().currentTopic).toBe('game');

    mgr.update(makeResult({ topic: 'general', generalScore: 6 }));
    expect(mgr.getState().currentTopic).toBe('game');
    expect(mgr.getState().consecutiveGeneralSegments).toBe(1);

    mgr.update(makeResult({ topic: 'general', generalScore: 6 }));
    expect(mgr.getState().currentTopic).toBe('general');
    expect(mgr.getState().consecutiveGeneralSegments).toBe(2);
  });

  it('does not flip currentTopic on uncertain alone', () => {
    const mgr = new TopicStateManager(config);
    mgr.update(makeResult({ topic: 'game', gameScore: 8 }));
    mgr.update(makeResult({ topic: 'uncertain', confidence: 0.2, gameScore: 0, generalScore: 0 }));
    expect(mgr.getState().currentTopic).toBe('game');
  });

  it('inherits general for uncertain after personal story', () => {
    const mgr = new TopicStateManager(config);
    const first = classifier.classify({
      currentText: 'I finally got my visa approved.',
      previousSegments: [],
      gameProfile: poe,
    });
    expect(first.topic).toBe('general');
    mgr.update(first);

    const second = classifier.classify({
      currentText: 'It took forever.',
      previousSegments: [{ text: first.matchedGeneralSignals.join(' '), topic: 'general' }],
      gameProfile: poe,
      activeTopicState: mgr.getState(),
    });
    expect(second.topic).toBe('uncertain');
    expect(mgr.inheritTopicForUncertain(second)).toBe('general');

    const route = new TopicRoutingService().resolveRoute(second, mgr.getState());
    expect(route).toBe('general');
  });

  it('inherits game for uncertain after Divine Orb', () => {
    const mgr = new TopicStateManager(config);
    const first = classifier.classify({
      currentText: 'I need one more Divine Orb.',
      previousSegments: [],
      gameProfile: poe,
    });
    expect(first.topic).toBe('game');
    mgr.update(first);

    const second = makeResult({ topic: 'uncertain', confidence: 0.2 });
    expect(mgr.inheritTopicForUncertain(second)).toBe('game');
    const route = new TopicRoutingService().resolveRoute(second, mgr.getState());
    expect(route).toBe('conservative');
  });

  it('scenario: dinner story then Maven switches back to game', () => {
    const mgr = new TopicStateManager(config);
    const s1 = classifier.classify({
      currentText: 'My wife and I went out for dinner.',
      previousSegments: [],
      gameProfile: poe,
    });
    expect(s1.topic).toBe('general');
    mgr.update(s1);

    const s2 = classifier.classify({
      currentText: 'The food was really good.',
      previousSegments: [{ text: s1.matchedGeneralSignals[0] ?? '', topic: 'general' }],
      gameProfile: poe,
      activeTopicState: mgr.getState(),
    });
    expect(s2.topic).toBe('general');
    mgr.update(s2);
    expect(mgr.getState().currentTopic).toBe('general');

    const s3 = classifier.classify({
      currentText: "Okay, now let's fight Maven.",
      previousSegments: [],
      gameProfile: poe,
      activeTopicState: mgr.getState(),
    });
    expect(s3.topic).toBe('game');
    mgr.update(s3);
    expect(mgr.getState().currentTopic).toBe('game');
  });

  it('clear and resetForGameChange restore uncertain', () => {
    const mgr = new TopicStateManager(config);
    mgr.update(makeResult({ topic: 'game', gameScore: 8 }));
    mgr.clear();
    expect(mgr.getState().currentTopic).toBe('uncertain');
    mgr.update(makeResult({ topic: 'general', generalScore: 6 }));
    mgr.resetForGameChange();
    expect(mgr.getState().currentTopic).toBe('uncertain');
  });
});
