import { z } from 'zod';

export const RealtimeTokenRequestSchema = z.object({
  platform: z.string().optional(),
});

export const RealtimeTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number().int(),
  wsUrl: z.string().url(),
  userId: z.string(),
});

export type RealtimeTokenRequest = z.infer<typeof RealtimeTokenRequestSchema>;
export type RealtimeTokenResponse = z.infer<typeof RealtimeTokenResponseSchema>;

export const RealtimeTokenPayloadSchema = z.object({
  sub: z.string(),
  scope: z.literal('realtime'),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type RealtimeTokenPayload = z.infer<typeof RealtimeTokenPayloadSchema>;
