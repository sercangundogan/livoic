import { describe, expect, it } from 'vitest';
import { ClientEventSchema, ServerEventSchema } from './index.js';

describe('protocol validation', () => {
  it('accepts a valid session.start event', () => {
    const result = ClientEventSchema.safeParse({
      type: 'session.start',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      sourceLanguage: 'auto',
      targetLanguage: 'tr',
      encoding: 'pcm_s16le',
      sampleRate: 16000,
      channels: 1,
      platform: 'twitch',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid language codes', () => {
    const result = ClientEventSchema.safeParse({
      type: 'session.start',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      targetLanguage: 'xx',
      platform: 'twitch',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a translation.final event', () => {
    const result = ServerEventSchema.safeParse({
      type: 'translation.final',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      sequence: 42,
      timestamp: Date.now(),
      segmentId: 'segment-12',
      sourceText: 'We are going into the boss fight now.',
      translatedText: 'Şimdi boss savaşına giriyoruz.',
      startMs: 12300,
      endMs: 14800,
    });
    expect(result.success).toBe(true);
  });

  it('accepts stream.context.update', () => {
    const result = ClientEventSchema.safeParse({
      type: 'stream.context.update',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      streamContext: {
        platform: 'twitch',
        gameName: 'Path of Exile',
        channelName: 'streamer',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts translation.context.ready', () => {
    const result = ServerEventSchema.safeParse({
      type: 'translation.context.ready',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      sequence: 3,
      timestamp: Date.now(),
      game: {
        id: 'path-of-exile',
        displayName: 'Path of Exile',
        profileApplied: true,
        confidence: 1,
      },
    });
    expect(result.success).toBe(true);
  });
});
