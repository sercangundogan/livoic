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

  it('rejects server events without sequence', () => {
    const result = ServerEventSchema.safeParse({
      type: 'pong',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
  });
});
