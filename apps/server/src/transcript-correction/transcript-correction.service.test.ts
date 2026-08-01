import { describe, expect, it } from 'vitest';
import { AudioRingBuffer } from './audio-ring-buffer.js';
import { MockRetranscriber } from './retranscriber.js';
import { TranscriptCorrectionService } from './transcript-correction.service.js';
import { TranscriptStore } from './transcript-store.js';
import { GameProfileLoader } from '../game-context/game-profile.loader.js';

describe('TranscriptCorrectionService', () => {
  const sampleRate = 16_000;
  const profile = new GameProfileLoader().get('path-of-exile')!;

  function setup(map: Record<string, string> = {}) {
    const store = new TranscriptStore();
    const service = new TranscriptCorrectionService(store);
    const audioBuffer = new AudioRingBuffer(sampleRate, 45);
    // 3 seconds of audio covering typical segment times
    audioBuffer.push(Buffer.alloc(sampleRate * 2 * 3));
    const retranscriber = new MockRetranscriber(map);
    return { store, service, audioBuffer, retranscriber };
  }

  it('skips retranscribe for high-confidence segments', async () => {
    const { store, service, audioBuffer, retranscriber } = setup({
      'hello serious': 'hello Sirus',
    });
    retranscriber.pendingRaw = 'hello serious';
    retranscriber.fixedResult = 'should not be used';

    const result = await service.correctFinalSegment({
      segmentId: 'seg-1',
      rawText: 'hello everyone',
      confidence: 0.95,
      startMs: 0,
      endMs: 1000,
      sampleRate,
      audioBuffer,
      retranscriber,
      confidenceThreshold: 0.72,
      retranscribeTimeoutMs: 2500,
      enabled: true,
      profile,
    });

    expect(retranscriber.calls).toBe(0);
    expect(result.retranscribed).toBe(false);
    expect(result.textForTranslation).toBe('hello everyone');
    expect(store.get('seg-1')?.rawText).toBe('hello everyone');
    expect(store.get('seg-1')?.correctedText).toBeUndefined();
  });

  it('calls retranscriber for low-confidence segments', async () => {
    const { store, service, audioBuffer, retranscriber } = setup();
    retranscriber.fixedResult = 'we are fighting Sirus soon';

    const result = await service.correctFinalSegment({
      segmentId: 'seg-2',
      rawText: 'we are fighting serious soon',
      confidence: 0.4,
      startMs: 0,
      endMs: 1500,
      sampleRate,
      audioBuffer,
      retranscriber,
      confidenceThreshold: 0.72,
      retranscribeTimeoutMs: 2500,
      enabled: true,
      profile,
    });

    expect(retranscriber.calls).toBe(1);
    expect(result.retranscribed).toBe(true);
    expect(result.correctedText).toBe('we are fighting Sirus soon');
    expect(result.textForTranslation).toBe('we are fighting Sirus soon');
    expect(store.get('seg-2')?.rawText).toBe('we are fighting serious soon');
    expect(store.get('seg-2')?.correctedText).toBe('we are fighting Sirus soon');
    expect(store.get('seg-2')?.textForTranslation).toBe('we are fighting Sirus soon');
  });

  it('falls back to raw on retranscribe timeout then may still normalize', async () => {
    const { store, service, audioBuffer, retranscriber } = setup();
    retranscriber.delayMs = 5000;
    retranscriber.fixedResult = 'should not arrive';

    const result = await service.correctFinalSegment({
      segmentId: 'seg-3',
      rawText: 'boss fight against serious',
      confidence: 0.3,
      startMs: 0,
      endMs: 1200,
      sampleRate,
      audioBuffer,
      retranscriber,
      confidenceThreshold: 0.72,
      retranscribeTimeoutMs: 50,
      enabled: true,
      profile,
    });

    expect(result.timedOut).toBe(true);
    expect(result.retranscribed).toBe(false);
    // Normalization still applies on raw fallback
    expect(result.correctedText).toBe('boss fight against Sirus');
    expect(result.textForTranslation).toBe('boss fight against Sirus');
    expect(store.get('seg-3')?.rawText).toBe('boss fight against serious');
  });

  it('uses corrected text for translation when valid correction exists', async () => {
    const { service, audioBuffer, retranscriber } = setup();
    // High confidence but still normalize path: no retranscribe, normalize alone
    const result = await service.correctFinalSegment({
      segmentId: 'seg-4',
      rawText: 'boss fight against serious',
      confidence: 0.99,
      startMs: 0,
      endMs: 1000,
      sampleRate,
      audioBuffer,
      retranscriber,
      confidenceThreshold: 0.72,
      retranscribeTimeoutMs: 2500,
      enabled: true,
      profile,
    });

    expect(retranscriber.calls).toBe(0);
    expect(result.textForTranslation).toBe('boss fight against Sirus');
    expect(result.correctedText).toBe('boss fight against Sirus');
    expect(result.rawText).toBe('boss fight against serious');
  });

  it('stores raw when disabled and skips correction path', async () => {
    const { store, service, audioBuffer, retranscriber } = setup();
    retranscriber.fixedResult = 'ignored';

    const result = await service.correctFinalSegment({
      segmentId: 'seg-5',
      rawText: 'boss fight against serious',
      confidence: 0.2,
      startMs: 0,
      endMs: 1000,
      sampleRate,
      audioBuffer,
      retranscriber,
      confidenceThreshold: 0.72,
      retranscribeTimeoutMs: 2500,
      enabled: false,
      profile,
    });

    expect(retranscriber.calls).toBe(0);
    expect(result.textForTranslation).toBe('boss fight against serious');
    expect(store.get('seg-5')?.correctedText).toBeUndefined();
  });

  it('clears store on clear()', async () => {
    const { store, service, audioBuffer, retranscriber } = setup();
    await service.correctFinalSegment({
      segmentId: 'seg-6',
      rawText: 'hello',
      confidence: 0.9,
      sampleRate,
      audioBuffer,
      retranscriber,
      confidenceThreshold: 0.72,
      retranscribeTimeoutMs: 2500,
      enabled: true,
    });
    expect(store.size()).toBe(1);
    store.clear();
    expect(store.size()).toBe(0);
  });
});
