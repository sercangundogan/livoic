import { z } from 'zod';
import { AppErrorCodeSchema, SessionStatusSchema } from './common.js';

const BaseServerEventSchema = z.object({
  sessionId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.number().int(),
});

export const SessionReadyEventSchema = BaseServerEventSchema.extend({
  type: z.literal('session.ready'),
  detectedSourceLanguage: z.string().optional(),
});

export const SessionStatusEventSchema = BaseServerEventSchema.extend({
  type: z.literal('session.status'),
  status: SessionStatusSchema,
  message: z.string().optional(),
});

export const TranscriptPartialEventSchema = BaseServerEventSchema.extend({
  type: z.literal('transcript.partial'),
  segmentId: z.string(),
  text: z.string(),
  startMs: z.number().nonnegative().optional(),
  endMs: z.number().nonnegative().optional(),
});

export const TranscriptFinalEventSchema = BaseServerEventSchema.extend({
  type: z.literal('transcript.final'),
  segmentId: z.string(),
  text: z.string(),
  language: z.string().optional(),
  startMs: z.number().nonnegative().optional(),
  endMs: z.number().nonnegative().optional(),
});

export const TranslationFinalEventSchema = BaseServerEventSchema.extend({
  type: z.literal('translation.final'),
  segmentId: z.string(),
  sourceText: z.string(),
  translatedText: z.string(),
  startMs: z.number().nonnegative().optional(),
  endMs: z.number().nonnegative().optional(),
});

export const UsageUpdateEventSchema = BaseServerEventSchema.extend({
  type: z.literal('usage.update'),
  audioSeconds: z.number().nonnegative(),
  audioSecondsToday: z.number().nonnegative().optional(),
});

export const TranslationContextReadyEventSchema = BaseServerEventSchema.extend({
  type: z.literal('translation.context.ready'),
  game: z.object({
    id: z.string().nullable(),
    displayName: z.string().optional(),
    profileApplied: z.boolean(),
    confidence: z.number().optional(),
  }),
});

export const ErrorEventSchema = BaseServerEventSchema.extend({
  type: z.literal('error'),
  code: AppErrorCodeSchema,
  message: z.string(),
  recoverable: z.boolean().default(false),
});

export const PongEventSchema = BaseServerEventSchema.extend({
  type: z.literal('pong'),
  clientTime: z.number().int().optional(),
});

export const ServerEventSchema = z.discriminatedUnion('type', [
  SessionReadyEventSchema,
  SessionStatusEventSchema,
  TranscriptPartialEventSchema,
  TranscriptFinalEventSchema,
  TranslationFinalEventSchema,
  UsageUpdateEventSchema,
  TranslationContextReadyEventSchema,
  ErrorEventSchema,
  PongEventSchema,
]);

export type SessionReadyEvent = z.infer<typeof SessionReadyEventSchema>;
export type SessionStatusEvent = z.infer<typeof SessionStatusEventSchema>;
export type TranscriptPartialEvent = z.infer<typeof TranscriptPartialEventSchema>;
export type TranscriptFinalEvent = z.infer<typeof TranscriptFinalEventSchema>;
export type TranslationFinalEvent = z.infer<typeof TranslationFinalEventSchema>;
export type UsageUpdateEvent = z.infer<typeof UsageUpdateEventSchema>;
export type TranslationContextReadyEvent = z.infer<typeof TranslationContextReadyEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type PongEvent = z.infer<typeof PongEventSchema>;
export type ServerEvent = z.infer<typeof ServerEventSchema>;
