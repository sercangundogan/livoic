import { z } from 'zod';

export const StreamContextSchema = z.object({
  platform: z.literal('twitch').default('twitch'),
  channelName: z.string().optional(),
  streamTitle: z.string().optional(),
  gameName: z.string().optional(),
  gameSlug: z.string().optional(),
  detectedAt: z.number().int().optional(),
});

export type StreamContext = z.infer<typeof StreamContextSchema>;
