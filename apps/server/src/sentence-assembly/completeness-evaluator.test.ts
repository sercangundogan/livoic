import { describe, expect, it } from 'vitest';
import { SentenceCompletenessEvaluator } from './completeness-evaluator.js';
import type { RawTranscriptSegment } from './types.js';

const evaluator = new SentenceCompletenessEvaluator();

function evaluate(text: string) {
  const segment: RawTranscriptSegment = { segmentId: 's1', text };
  return evaluator.evaluate({
    segment,
    text,
    preliminaryTopic: 'game',
    recentSegments: [],
  });
}

describe('SentenceCompletenessEvaluator', () => {
  it('marks clear terminal sentences as complete', () => {
    expect(evaluate('We killed Maven.').completeness).toBe('complete');
    expect(evaluate('We killed Maven.').shouldHold).toBe(false);
    expect(evaluate('I went to the dentist yesterday.').completeness).toBe('complete');
    expect(evaluate("That's enough for now.").completeness).toBe('complete');
  });

  it('marks incomplete clause patterns as incomplete', () => {
    const problem = evaluate('The problem with this build is');
    expect(problem.completeness).toBe('incomplete');
    expect(problem.shouldHold).toBe(true);
    expect(problem.reasons).toContain('incomplete-clause-pattern');

    const should = evaluate('I think we should');
    expect(should.completeness).toBe('incomplete');
    expect(should.shouldHold).toBe(true);

    const becauseOf = evaluate('because of');
    expect(becauseOf.completeness).toBe('incomplete');
    expect(becauseOf.shouldHold).toBe(true);

    const but = evaluate('This build is strong, but');
    expect(but.completeness).toBe('incomplete');
    expect(but.reasons).toContain('trailing-conjunction');
  });

  it('holds short fragments like I think this build', () => {
    const result = evaluate('I think this build');
    expect(result.shouldHold).toBe(true);
    expect(['incomplete', 'uncertain']).toContain(result.completeness);
  });

  it('treats ambiguous mid-length clauses as uncertain or complete', () => {
    const a = evaluate('That was pretty bad');
    expect(['uncertain', 'complete', 'incomplete']).toContain(a.completeness);

    const b = evaluate('I finally got it');
    expect(['uncertain', 'complete', 'incomplete']).toContain(b.completeness);
  });

  it('flags filler-only utterances', () => {
    const result = evaluate('uh');
    expect(result.isFillerOnly).toBe(true);
    expect(result.completeness).toBe('incomplete');
  });

  it('recommends stronger hold for high incomplete scores', () => {
    const result = evaluate('I think we should');
    expect(result.recommendedWaitMs).toBeGreaterThanOrEqual(650);
    expect(result.recommendedWaitMs).toBeLessThanOrEqual(1200);
  });

  it('recommends zero wait for complete sentences', () => {
    expect(evaluate('We killed Maven.').recommendedWaitMs).toBe(0);
  });
});
