import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSentenceAssemblyConfig } from './config.js';
import { SentenceAssemblyService } from './sentence-assembly.service.js';
import type { AssembledUtterance, RawTranscriptSegment } from './types.js';

function seg(id: string, text: string, startMs: number, endMs: number): RawTranscriptSegment {
  return { segmentId: id, text, startMs, endMs };
}

describe('SentenceAssemblyService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds then merges a continuation into one assembled utterance', async () => {
    const assembled: AssembledUtterance[] = [];
    const service = new SentenceAssemblyService(
      loadSentenceAssemblyConfig({}),
      (u) => {
        assembled.push(u);
      },
      { sessionId: 'sess-1' },
    );

    const first = await service.handleFinalSegment({
      segment: seg('1', 'I think this build', 1000, 1500),
      preliminaryTopic: 'game',
    });
    expect(first.action).toBe('held');
    expect(assembled).toHaveLength(0);

    const second = await service.handleFinalSegment({
      segment: seg('2', 'needs more attack speed.', 1700, 2200),
      preliminaryTopic: 'game',
    });
    expect(second.action).toBe('flushed');
    expect(assembled).toHaveLength(1);
    expect(assembled[0]!.rawText).toBe('I think this build needs more attack speed.');
    expect(assembled[0]!.sourceSegmentIds).toEqual(['1', '2']);
    expect(assembled[0]!.startMs).toBe(1000);
    expect(assembled[0]!.endMs).toBe(2200);
    expect(assembled[0]!.mergeCount).toBe(1);
  });

  it('flushes once on timeout and ignores late timer after clear', async () => {
    const assembled: AssembledUtterance[] = [];
    const service = new SentenceAssemblyService(
      loadSentenceAssemblyConfig({}),
      (u) => {
        assembled.push(u);
      },
    );

    await service.handleFinalSegment({
      segment: seg('1', 'The problem with this build is', 0, 500),
      preliminaryTopic: 'game',
    });
    expect(service.getPending()).not.toBeNull();

    await vi.advanceTimersByTimeAsync(2000);
    expect(assembled).toHaveLength(1);
    expect(assembled[0]!.flushReason).toBe('timeout');

    // Second advance must not duplicate
    await vi.advanceTimersByTimeAsync(2000);
    expect(assembled).toHaveLength(1);
  });

  it('clear cancels timer and prevents flush', async () => {
    const assembled: AssembledUtterance[] = [];
    const service = new SentenceAssemblyService(
      loadSentenceAssemblyConfig({}),
      (u) => {
        assembled.push(u);
      },
    );

    await service.handleFinalSegment({
      segment: seg('1', 'I think we should', 0, 400),
      preliminaryTopic: 'game',
    });
    service.clear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(assembled).toHaveLength(0);
    expect(service.getPending()).toBeNull();
  });

  it('discards filler-only when nothing is pending', async () => {
    const assembled: AssembledUtterance[] = [];
    const service = new SentenceAssemblyService(loadSentenceAssemblyConfig({}), (u) => {
      assembled.push(u);
    });

    const result = await service.handleFinalSegment({
      segment: seg('1', 'uh', 0, 100),
      preliminaryTopic: 'uncertain',
    });
    expect(result.action).toBe('discarded');
    expect(assembled).toHaveLength(0);
  });

  it('flushes complete sentences immediately', async () => {
    const assembled: AssembledUtterance[] = [];
    const service = new SentenceAssemblyService(loadSentenceAssemblyConfig({}), (u) => {
      assembled.push(u);
    });

    const result = await service.handleFinalSegment({
      segment: seg('1', 'We killed Maven.', 0, 800),
      preliminaryTopic: 'game',
    });
    expect(result.action).toBe('flushed');
    expect(assembled).toHaveLength(1);
    expect(assembled[0]!.rawText).toBe('We killed Maven.');
  });

  it('does not emit duplicate assembled ids', async () => {
    const assembled: AssembledUtterance[] = [];
    const service = new SentenceAssemblyService(loadSentenceAssemblyConfig({}), (u) => {
      assembled.push(u);
    });

    await service.handleFinalSegment({
      segment: seg('1', 'I think this build', 0, 500),
      preliminaryTopic: 'game',
    });
    const pendingId = service.getPending()!.id;
    await service.flush('session-stop');
    await service.flush('session-stop');
    expect(assembled).toHaveLength(1);
    expect(assembled[0]!.id).toBe(pendingId);
  });

  it('flushes pending before incompatible next segment', async () => {
    const assembled: AssembledUtterance[] = [];
    const service = new SentenceAssemblyService(loadSentenceAssemblyConfig({}), (u) => {
      assembled.push(u);
    });

    await service.handleFinalSegment({
      segment: seg('1', 'I think this build', 0, 500),
      preliminaryTopic: 'game',
    });
    await service.handleFinalSegment({
      segment: seg('2', 'By the way, my flight was delayed.', 900, 1400),
      preliminaryTopic: 'general',
    });

    expect(assembled.length).toBeGreaterThanOrEqual(1);
    expect(assembled[0]!.rawText).toBe('I think this build');
  });
});
