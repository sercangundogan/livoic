import { z } from 'zod';
import { AudioEncodingSchema, LanguageCodeSchema, PlatformSchema } from './common.js';

const BaseClientEventSchema = z.object({
  sessionId: z.string().uuid(),
});

export const SessionStartEventSchema = BaseClientEventSchema.extend({
  type: z.literal('session.start'),
  sourceLanguage: LanguageCodeSchema.default('auto'),
  targetLanguage: LanguageCodeSchema,
  encoding: AudioEncodingSchema.default('pcm_s16le'),
  sampleRate: z.literal(16000).default(16000),
  channels: z.literal(1).default(1),
  platform: PlatformSchema,
});

export const SessionStopEventSchema = BaseClientEventSchema.extend({
  type: z.literal('session.stop'),
});

export const SessionResumeEventSchema = BaseClientEventSchema.extend({
  type: z.literal('session.resume'),
  lastSequence: z.number().int().nonnegative(),
});

export const SettingsUpdateEventSchema = BaseClientEventSchema.extend({
  type: z.literal('settings.update'),
  targetLanguage: LanguageCodeSchema.optional(),
});

export const PingEventSchema = BaseClientEventSchema.extend({
  type: z.literal('ping'),
  clientTime: z.number().int().optional(),
});

export const ClientEventSchema = z.discriminatedUnion('type', [
  SessionStartEventSchema,
  SessionStopEventSchema,
  SessionResumeEventSchema,
  SettingsUpdateEventSchema,
  PingEventSchema,
]);

export type SessionStartEvent = z.infer<typeof SessionStartEventSchema>;
export type SessionStopEvent = z.infer<typeof SessionStopEventSchema>;
export type SessionResumeEvent = z.infer<typeof SessionResumeEventSchema>;
export type SettingsUpdateEvent = z.infer<typeof SettingsUpdateEventSchema>;
export type PingEvent = z.infer<typeof PingEventSchema>;
export type ClientEvent = z.infer<typeof ClientEventSchema>;
