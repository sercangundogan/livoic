import { describe, expect, it } from 'vitest';
import { GameProfileLoader } from '../game-context/game-profile.loader.js';
import { DeterministicTopicClassifier } from './topic-classifier.js';
import { loadTopicRoutingConfig } from './config.js';

const loader = new GameProfileLoader();
const poe = loader.get('path-of-exile')!;
const classifier = new DeterministicTopicClassifier(loadTopicRoutingConfig({}));

function classify(text: string, previous: Array<{ text: string; topic?: 'game' | 'general' | 'uncertain' }> = []) {
  return classifier.classify({
    currentText: text,
    previousSegments: previous,
    gameProfile: poe,
    gameContext: { gameId: 'path-of-exile', displayName: 'Path of Exile', confidence: 1 },
    streamContext: { gameName: 'Path of Exile', streamTitle: 'PoE mapping' },
  });
}

describe('DeterministicTopicClassifier', () => {
  describe('game-related', () => {
    it('classifies spell suppression as game', () => {
      const result = classify('I need more spell suppression.');
      expect(result.topic).toBe('game');
      expect(result.gameScore).toBeGreaterThanOrEqual(3);
    });

    it('classifies Maven + map as game', () => {
      const result = classify("We're fighting Maven after this map.");
      expect(result.topic).toBe('game');
      expect(result.matchedGameTerms.map((t) => t.toLowerCase())).toEqual(
        expect.arrayContaining(['maven']),
      );
    });

    it('classifies build + damage as game', () => {
      const result = classify('This build needs more damage.');
      expect(result.topic).toBe('game');
    });
  });

  describe('general conversation', () => {
    it('classifies dentist visit as general', () => {
      const result = classify('I went to the dentist yesterday.');
      expect(result.topic).toBe('general');
      expect(result.generalScore).toBeGreaterThan(result.gameScore);
    });

    it('classifies wife travel as general', () => {
      const result = classify('My wife and I are traveling next week.');
      expect(result.topic).toBe('general');
    });

    it('classifies work day as general', () => {
      const result = classify('I was at work all day.');
      expect(result.topic).toBe('general');
    });
  });

  describe('uncertain', () => {
    it('classifies vague evaluation as uncertain', () => {
      expect(classify('That was pretty bad.').topic).toBe('uncertain');
    });

    it('classifies ambiguous got-it as uncertain', () => {
      expect(classify('I finally got it.').topic).toBe('uncertain');
    });

    it('classifies fix-it as uncertain', () => {
      expect(classify('That should fix it.').topic).toBe('uncertain');
    });
  });

  describe('context inheritance via previous segments', () => {
    it('leans general after personal-story history', () => {
      const result = classify('Then I came home.', [
        { text: 'I went to the doctor yesterday.', topic: 'general' },
        { text: 'It took two hours.', topic: 'uncertain' },
      ]);
      expect(result.topic).toBe('general');
    });

    it('leans game after gameplay history for ambiguous fix-it', () => {
      const result = classify('That should fix it.', [
        { text: 'My spell suppression is low.', topic: 'game' },
        { text: 'I need more on the gloves.', topic: 'game' },
      ]);
      // May be game (continuation weight) or uncertain — not general
      expect(result.topic).not.toBe('general');
      expect(result.gameScore).toBeGreaterThan(result.generalScore);
    });
  });

  it('does not treat first-person game speak as personal story', () => {
    const result = classify('I need more damage.');
    expect(result.topic).toBe('game');
    expect(result.reasons).not.toContain('personal-story-signal');
  });
});
