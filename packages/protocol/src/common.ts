import { z } from 'zod';

export const LanguageCodeSchema = z.enum([
  'auto',
  'en',
  'tr',
  'de',
  'es',
  'fr',
  'pt',
  'it',
  'ja',
  'ko',
]);

export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

export const PlatformSchema = z.enum(['twitch', 'youtube', 'kick', 'generic']);
export type Platform = z.infer<typeof PlatformSchema>;

export const AudioEncodingSchema = z.literal('pcm_s16le');
export type AudioEncoding = z.infer<typeof AudioEncodingSchema>;

export const SessionStatusSchema = z.enum([
  'idle',
  'detecting',
  'ready',
  'requesting-permission',
  'connecting',
  'listening',
  'reconnecting',
  'paused',
  'stopping',
  'stopped',
  'error',
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const AppErrorCodeSchema = z.enum([
  'UNSUPPORTED_PAGE',
  'PLAYER_NOT_FOUND',
  'CAPTURE_PERMISSION_DENIED',
  'AUDIO_CAPTURE_FAILED',
  'BACKEND_UNAVAILABLE',
  'AUTH_FAILED',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'SESSION_EXPIRED',
  'UNKNOWN_ERROR',
]);

export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

export const SubtitleModeSchema = z.enum(['translation', 'bilingual', 'source']);
export type SubtitleMode = z.infer<typeof SubtitleModeSchema>;

export const SubtitleSizeSchema = z.enum(['small', 'medium', 'large']);
export type SubtitleSize = z.infer<typeof SubtitleSizeSchema>;

export const SubtitleBackgroundSchema = z.enum(['off', 'subtle']);
export type SubtitleBackground = z.infer<typeof SubtitleBackgroundSchema>;

export const SubtitlePositionSchema = z.enum(['low', 'medium']);
export type SubtitlePosition = z.infer<typeof SubtitlePositionSchema>;
