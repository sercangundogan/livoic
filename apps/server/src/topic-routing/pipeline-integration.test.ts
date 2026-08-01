import { describe, expect, it } from 'vitest';
import { GameProfileLoader } from '../game-context/game-profile.loader.js';
import type { TranslationInput } from '../translation/translation-provider.js';
import {
  DeterministicTopicClassifier,
  TopicRoutingService,
  TopicStateManager,
  assertNoGameContextInGeneralRoute,
  loadTopicRoutingConfig,
  normalizeForRoute,
} from './index.js';

const config = loadTopicRoutingConfig({});
const classifier = new DeterministicTopicClassifier(config);
const routing = new TopicRoutingService();
const poe = new GameProfileLoader().get('path-of-exile')!;

function classifyAndRoute(
  text: string,
  state: TopicStateManager,
  previous: Array<{ text: string; topic?: 'game' | 'general' | 'uncertain' }> = [],
) {
  const classification = classifier.classify({
    currentText: text,
    previousSegments: previous,
    gameProfile: poe,
    gameContext: { gameId: 'path-of-exile', displayName: 'Path of Exile', confidence: 1 },
    streamContext: { gameName: 'Path of Exile', streamTitle: 'PoE mapping' },
    activeTopicState: state.getState(),
  });
  state.update(classification);
  const route = routing.resolveRoute(classification, state.getState());
  const normalized = normalizeForRoute(text, route, poe);
  return { classification, route, normalized };
}

describe('topic routing pipeline integration', () => {
  it('routes dentist visit to general and does not apply serious→Sirus', () => {
    const state = new TopicStateManager(config);
    const dentist = classifyAndRoute('I went to the dentist yesterday.', state);
    expect(dentist.classification.topic).toBe('general');
    expect(dentist.route).toBe('general');

    const serious = normalizeForRoute('This is serious.', 'general', poe);
    expect(serious.text).toBe('This is serious.');
    expect(serious.appliedAliases).toEqual([]);

    const generalInput: TranslationInput = {
      text: 'I went to the dentist yesterday.',
      targetLanguage: 'tr',
      domainContext: { type: 'general' },
    };
    expect(() => assertNoGameContextInGeneralRoute(generalInput)).not.toThrow();
  });

  it('routes spell suppression + Maven to game-aware', () => {
    const state = new TopicStateManager(config);
    const result = classifyAndRoute(
      'I need more spell suppression before Maven.',
      state,
    );
    expect(result.classification.topic).toBe('game');
    expect(result.route).toBe('game-aware');
    expect(
      result.classification.matchedGameTerms.some((t) =>
        /spell suppression|maven/i.test(t),
      ),
    ).toBe(true);
  });

  it('simulates topic switch from game to general via TopicStateManager', () => {
    const state = new TopicStateManager(config);

    const game1 = classifyAndRoute('I need more spell suppression.', state);
    expect(game1.classification.topic).toBe('game');
    expect(state.getState().currentTopic).toBe('game');

    const general1 = classifyAndRoute('I went to the dentist yesterday.', state, [
      { text: 'I need more spell suppression.', topic: 'game' },
    ]);
    expect(general1.classification.topic).toBe('general');
    // Still game until generalSwitchSegments consecutive generals
    expect(state.getState().currentTopic).toBe('game');
    expect(state.getState().consecutiveGeneralSegments).toBe(1);

    const general2 = classifyAndRoute('My wife and I are traveling next week.', state, [
      { text: 'I need more spell suppression.', topic: 'game' },
      { text: 'I went to the dentist yesterday.', topic: 'general' },
    ]);
    expect(general2.classification.topic).toBe('general');
    expect(state.getState().currentTopic).toBe('general');
    expect(general2.route).toBe('general');
  });
});
