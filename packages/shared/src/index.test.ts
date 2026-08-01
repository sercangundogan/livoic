import { describe, expect, it } from 'vitest';
import {
  ChunkAccumulator,
  downmixStereoToMono,
  float32ToInt16,
  resampleLinear,
} from './audio.js';
import { getReconnectDelay, SequenceTracker, shouldRetry } from './reconnect.js';
import { canTransition, transition } from './session-state.js';
import {
  buildTranslationContext,
  formatSubtitleText,
  isDuplicateFinal,
  mergeShortSegments,
} from './subtitle-formatter.js';

describe('audio conversion', () => {
  it('converts float32 to int16', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const output = float32ToInt16(input);
    expect(output[0]).toBe(0);
    expect(output[1]).toBe(Math.floor(0.5 * 0x7fff));
    expect(output[2]).toBe(Math.floor(-0.5 * 0x8000));
    expect(output[3]).toBe(0x7fff);
    expect(output[4]).toBe(-0x8000);
  });

  it('downmixes stereo to mono', () => {
    const stereo = new Float32Array([1, -1, 0.5, 0.5]);
    const mono = downmixStereoToMono(stereo, 2);
    expect(mono.length).toBe(2);
    expect(mono[0]).toBeCloseTo(0);
    expect(mono[1]).toBeCloseTo(0.5);
  });

  it('resamples linearly', () => {
    const input = new Float32Array([0, 1, 0, 1]);
    const output = resampleLinear(input, 4, 2);
    expect(output.length).toBe(2);
  });

  it('accumulates stable chunks', () => {
    const acc = new ChunkAccumulator(4);
    const a = acc.push(new Float32Array([1, 2]));
    expect(a).toHaveLength(0);
    const b = acc.push(new Float32Array([3, 4, 5]));
    expect(b).toHaveLength(1);
    expect(Array.from(b[0]!)).toEqual([1, 2, 3, 4]);
  });
});

describe('session transitions', () => {
  it('allows ready → requesting-permission', () => {
    expect(canTransition('ready', 'requesting-permission')).toBe(true);
    expect(transition('ready', 'requesting-permission').ok).toBe(true);
  });

  it('rejects listening → ready', () => {
    expect(canTransition('listening', 'ready')).toBe(false);
    expect(transition('listening', 'ready').ok).toBe(false);
  });
});

describe('reconnect helpers', () => {
  it('uses exponential delays capped at 10s', () => {
    expect(getReconnectDelay(0)).toBe(1000);
    expect(getReconnectDelay(1)).toBe(2000);
    expect(getReconnectDelay(4)).toBe(10000);
    expect(getReconnectDelay(99)).toBe(10000);
  });

  it('stops after max attempts', () => {
    expect(shouldRetry(0)).toBe(true);
    expect(shouldRetry(5)).toBe(false);
  });

  it('deduplicates sequences', () => {
    const tracker = new SequenceTracker();
    expect(tracker.accept(1)).toBe(true);
    expect(tracker.accept(1)).toBe(false);
    expect(tracker.accept(2)).toBe(true);
  });
});

describe('subtitle formatter', () => {
  it('splits long sentences', () => {
    const text =
      'We are going into the boss fight now and everyone needs to stay together please.';
    const result = formatSubtitleText(text);
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
    expect(result.lines.length).toBeLessThanOrEqual(2);
    expect(result.displayMs).toBeGreaterThanOrEqual(1000);
  });

  it('merges short segments', () => {
    expect(mergeShortSegments(['Hi', 'there friend', 'ok'])).toEqual(['Hi there friend', 'ok']);
  });

  it('detects duplicate finals', () => {
    expect(isDuplicateFinal('Hello world', ' hello  world ')).toBe(true);
    expect(isDuplicateFinal('Hello', 'World')).toBe(false);
  });

  it('builds translation context', () => {
    const ctx = buildTranslationContext(['a', 'b', 'c', 'd', 'e', 'f'], 'current', {
      targetLanguage: 'tr',
    });
    expect(ctx.previousSegments).toHaveLength(5);
    expect(ctx.currentSegment).toBe('current');
    expect(ctx.targetLanguage).toBe('tr');
  });
});
