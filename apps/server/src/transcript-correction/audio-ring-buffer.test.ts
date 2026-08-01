import { describe, expect, it } from 'vitest';
import { AudioRingBuffer } from './audio-ring-buffer.js';

describe('AudioRingBuffer', () => {
  const sampleRate = 16_000;
  // 1 second of mono s16le = 32000 bytes
  const bytesPerSecond = sampleRate * 2;

  function silence(ms: number): Buffer {
    const bytes = Math.floor((ms / 1000) * bytesPerSecond);
    return Buffer.alloc(bytes - (bytes % 2));
  }

  it('tracks durationMs from pushed PCM', () => {
    const buf = new AudioRingBuffer(sampleRate, 10);
    expect(buf.durationMs).toBe(0);
    buf.push(silence(500));
    expect(buf.durationMs).toBeCloseTo(500, 0);
  });

  it('extracts a time range with padding', () => {
    const buf = new AudioRingBuffer(sampleRate, 10);
    // Push 1s of identifiable samples: each 2-byte sample = index
    const pcm = Buffer.alloc(bytesPerSecond);
    for (let i = 0; i < sampleRate; i++) {
      pcm.writeInt16LE(i % 1000, i * 2);
    }
    buf.push(pcm);

    const slice = buf.extract(100, 200, 0);
    // 100ms = 1600 samples = 3200 bytes
    expect(slice.length).toBe(3200);
  });

  it('drops oldest data when over capacity', () => {
    const buf = new AudioRingBuffer(sampleRate, 1); // max 1 second
    buf.push(silence(800));
    buf.push(silence(800));
    expect(buf.durationMs).toBeLessThanOrEqual(1000 + 1);
    expect(buf.durationMs).toBeGreaterThan(500);
  });

  it('clears buffer', () => {
    const buf = new AudioRingBuffer(sampleRate, 5);
    buf.push(silence(300));
    buf.clear();
    expect(buf.durationMs).toBe(0);
    expect(buf.extract(0, 100).length).toBe(0);
  });

  it('keeps absolute timeline after dropping old data', () => {
    const buf = new AudioRingBuffer(sampleRate, 1);
    // Marker at t=0..100ms then more audio past capacity
    const marker = Buffer.alloc(Math.floor(0.1 * bytesPerSecond));
    marker.fill(0xaa);
    buf.push(marker);
    buf.push(silence(1200));
    // Early marker should be gone
    const early = buf.extract(0, 50);
    expect(early.length).toBe(0);
    // Later range still extractable
    const late = buf.extract(800, 900);
    expect(late.length).toBeGreaterThan(0);
  });
});
