import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSentenceAssemblyConfig } from './config.js';
import { SentenceAssemblyService } from './sentence-assembly.service.js';
import type { AssembledUtterance, RawTranscriptSegment } from './types.js';

/**
 * Pipeline-level check: two STT fragments assemble into one utterance that the
 * session would then correct → classify → translate. Full TranslationSession
 * wiring is integration-tested via runtime; this covers the assembly contract.
 */
describe('sentence assembly pipeline integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function seg(id: string, text: string, startMs: number, endMs: number): RawTranscriptSegment {
    return { segmentId: id, text, startMs, endMs };
  }

  it('merges two fragments into one assembled rawText for downstream process', async () => {
    const processed: AssembledUtterance[] = [];
    const service = new SentenceAssemblyService(
      loadSentenceAssemblyConfig({}),
      async (utterance) => {
        // Simulate session processAssembledUtterance entry: one call per flush
        processed.push(utterance);
      },
      { sessionId: 'pipeline-test' },
    );

    const first = await service.handleFinalSegment({
      segment: seg('frag-1', 'I think this build', 1000, 1500),
      preliminaryTopic: 'game',
    });
    expect(first.action).toBe('held');
    expect(processed).toHaveLength(0);

    const second = await service.handleFinalSegment({
      segment: seg('frag-2', 'needs more attack speed.', 1700, 2200),
      preliminaryTopic: 'game',
    });
    expect(second.action).toBe('flushed');
    expect(processed).toHaveLength(1);

    const assembled = processed[0]!;
    expect(assembled.rawText).toBe('I think this build needs more attack speed.');
    expect(assembled.sourceSegmentIds).toEqual(['frag-1', 'frag-2']);
    expect(assembled.startMs).toBe(1000);
    expect(assembled.endMs).toBe(2200);
    expect(assembled.mergeCount).toBe(1);
    expect(assembled.preliminaryTopics[0]).toBe('game');
  });
});
