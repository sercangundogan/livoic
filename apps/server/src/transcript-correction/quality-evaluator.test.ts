import { describe, expect, it } from 'vitest';
import { evaluateQuality } from './quality-evaluator.js';
import type { GameTranslationProfile } from '../game-context/types.js';

const profile = {
  id: 'path-of-exile',
  displayName: 'Path of Exile',
  aliases: [],
  contextDescription: 'test',
  preserveTerms: ['Sirus', 'Maven', 'Headhunter'],
  preferredTranslations: {},
  contextualTerms: [],
  styleRules: [],
  examples: [],
  phoneticAliases: [{ from: 'serious', to: 'Sirus' }],
} as GameTranslationProfile;

describe('evaluateQuality', () => {
  it('marks low confidence when below threshold', () => {
    const result = evaluateQuality({
      text: 'hello world',
      confidence: 0.5,
      threshold: 0.72,
    });
    expect(result.isLowConfidence).toBe(true);
    expect(result.shouldRetranscribe).toBe(true);
    expect(result.reasons).toContain('confidence_below_threshold');
  });

  it('skips retranscribe for high confidence', () => {
    const result = evaluateQuality({
      text: 'hello world',
      confidence: 0.95,
      threshold: 0.72,
    });
    expect(result.isLowConfidence).toBe(false);
    expect(result.shouldRetranscribe).toBe(false);
  });

  it('does not always retranscribe when confidence is missing', () => {
    const result = evaluateQuality({
      text: 'hello everyone watching the stream',
      threshold: 0.72,
    });
    expect(result.shouldRetranscribe).toBe(false);
    expect(result.reasons).toContain('confidence_missing_skip_retranscribe');
  });

  it('retranscribes on strong near-miss to preserve terms when confidence missing', () => {
    const result = evaluateQuality({
      text: 'we fight siruss now',
      threshold: 0.72,
      profile,
    });
    expect(result.shouldRetranscribe).toBe(true);
    expect(result.isLowConfidence).toBe(true);
    expect(result.reasons.some((r) => r.startsWith('near_miss:'))).toBe(true);
  });

  it('does not treat known phonetic alias from-forms as near-miss', () => {
    const result = evaluateQuality({
      text: 'this is serious',
      threshold: 0.72,
      profile,
    });
    expect(result.shouldRetranscribe).toBe(false);
    expect(result.reasons).toContain('confidence_missing_skip_retranscribe');
  });
});
