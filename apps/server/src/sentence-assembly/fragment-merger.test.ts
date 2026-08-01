import { describe, expect, it } from 'vitest';
import { FragmentMerger, joinTexts } from './fragment-merger.js';
import { topicsCompatible } from './merge-policy.js';
import type { PendingUtterance, RawTranscriptSegment } from './types.js';

const merger = new FragmentMerger();

function pending(text: string, topic: PendingUtterance['preliminaryTopic'] = 'game'): PendingUtterance {
  const now = Date.now();
  return {
    id: 'p1',
    sessionId: 's',
    segments: [{ segmentId: 'a', text, startMs: now - 500, endMs: now }],
    combinedText: text,
    startMs: now - 500,
    endMs: now,
    createdAt: now,
    updatedAt: now,
    preliminaryTopic: topic,
    completeness: 'incomplete',
    mergeCount: 0,
    holdGeneration: 0,
  };
}

function next(text: string, startOffsetMs = 200): RawTranscriptSegment {
  const now = Date.now();
  return {
    segmentId: 'b',
    text,
    startMs: now + startOffsetMs,
    endMs: now + startOffsetMs + 400,
  };
}

describe('FragmentMerger', () => {
  it('merges incomplete game fragments with continuation', () => {
    const decision = merger.shouldMerge({
      pending: pending('I think this build'),
      next: next('needs more attack speed.'),
      nextTopic: 'game',
      gapMs: 420,
      mergeThreshold: 4,
      shortGapMs: 700,
      hardGapMs: 1500,
    });
    expect(decision.shouldMerge).toBe(true);
    expect(decision.reasons).toContain('previous-incomplete');
    expect(decision.reasons).toContain('sentence-fragment-continuation');
  });

  it('merges problem-is continuation', () => {
    const decision = merger.shouldMerge({
      pending: pending('The problem with this build is'),
      next: next('that it has no defense.'),
      nextTopic: 'game',
      gapMs: 300,
      mergeThreshold: 4,
      shortGapMs: 700,
      hardGapMs: 1500,
    });
    expect(decision.shouldMerge).toBe(true);
  });

  it('merges general conversation continuation', () => {
    const decision = merger.shouldMerge({
      pending: pending('I went to the dentist', 'general'),
      next: next('because my tooth was hurting.'),
      nextTopic: 'general',
      gapMs: 350,
      mergeThreshold: 4,
      shortGapMs: 700,
      hardGapMs: 1500,
    });
    expect(decision.shouldMerge).toBe(true);
  });

  it('does not merge after discourse reset', () => {
    const p = pending('I went to the dentist yesterday.', 'general');
    p.completeness = 'complete';
    const decision = merger.shouldMerge({
      pending: p,
      next: next("Okay, let's fight Maven."),
      nextTopic: 'game',
      gapMs: 800,
      mergeThreshold: 4,
      shortGapMs: 700,
      hardGapMs: 1500,
    });
    expect(decision.shouldMerge).toBe(false);
    expect(
      decision.reasons.some((r) =>
        ['discourse-reset', 'topic-conflict', 'previous-complete'].includes(r),
      ),
    ).toBe(true);
  });

  it('does not merge across by-the-way reset', () => {
    const p = pending('We killed Maven.');
    p.completeness = 'complete';
    const decision = merger.shouldMerge({
      pending: p,
      next: next('By the way, my flight was delayed.'),
      nextTopic: 'general',
      gapMs: 900,
      mergeThreshold: 4,
      shortGapMs: 700,
      hardGapMs: 1500,
    });
    expect(decision.shouldMerge).toBe(false);
  });

  it('does not merge game with general topic conflict', () => {
    const decision = merger.shouldMerge({
      pending: pending('I need more damage.'),
      next: next('My wife called me earlier.'),
      nextTopic: 'general',
      gapMs: 400,
      mergeThreshold: 4,
      shortGapMs: 700,
      hardGapMs: 1500,
    });
    expect(decision.shouldMerge).toBe(false);
    expect(decision.reasons).toContain('topic-conflict');
  });

  it('respects topic compatibility matrix', () => {
    expect(topicsCompatible('game', 'game')).toBe(true);
    expect(topicsCompatible('general', 'general')).toBe(true);
    expect(topicsCompatible('game', 'general')).toBe(false);
    expect(topicsCompatible('general', 'game')).toBe(false);
    expect(topicsCompatible('uncertain', 'game')).toBe(true);
    expect(topicsCompatible('game', 'uncertain')).toBe(true);
  });

  it('allows uncertain + game when evidence is strong', () => {
    const p = pending('We need more spell suppression', 'uncertain');
    const decision = merger.shouldMerge({
      pending: p,
      next: next('before fighting Maven.'),
      nextTopic: 'game',
      gapMs: 300,
      mergeThreshold: 4,
      shortGapMs: 700,
      hardGapMs: 1500,
    });
    expect(decision.shouldMerge).toBe(true);
  });

  it('denies hard gaps', () => {
    const decision = merger.shouldMerge({
      pending: pending('I think this build'),
      next: next('needs more attack speed.'),
      nextTopic: 'game',
      gapMs: 2000,
      mergeThreshold: 4,
      shortGapMs: 700,
      hardGapMs: 1500,
    });
    expect(decision.shouldMerge).toBe(false);
    expect(decision.reasons).toContain('long-time-gap');
  });

  it('joins broken words on merge', () => {
    const p = pending('spell supp-');
    const merged = merger.merge(p, next('ression on the gloves'));
    expect(merged.combinedText).toBe('spell suppression on the gloves');
    expect(merged.mergeCount).toBe(1);
    expect(merged.segments).toHaveLength(2);
  });

  it('joinTexts strips ellipsis before continuation', () => {
    expect(joinTexts('I think this build...', 'needs more damage.')).toBe(
      'I think this build needs more damage.',
    );
  });
});
