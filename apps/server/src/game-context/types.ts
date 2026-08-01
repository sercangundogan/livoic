import { z } from 'zod';

export const ContextualTermSchema = z.object({
  term: z.string().min(1),
  meaning: z.string().min(1),
  preferredTranslation: z.string().optional(),
  preserve: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
});

export const GameTranslationProfileSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    aliases: z.array(z.string()),
    contextDescription: z.string().min(1),
    preserveTerms: z.array(z.string()),
    preferredTranslations: z.record(z.string()),
    contextualTerms: z.array(ContextualTermSchema),
    protectedPatterns: z.array(z.string()).optional(),
    styleRules: z.array(z.string()),
    examples: z.array(
      z.object({
        source: z.string(),
        target: z.string(),
      }),
    ),
    metadata: z
      .object({
        version: z.number().int().positive(),
        updatedAt: z.string(),
      })
      .optional(),
  })
  .superRefine((profile, ctx) => {
    const preferredKeys = new Set(
      Object.keys(profile.preferredTranslations).map((k) => k.toLowerCase()),
    );
    for (const term of profile.preserveTerms) {
      if (preferredKeys.has(term.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Term "${term}" cannot be both preserve and preferredTranslation`,
          path: ['preserveTerms'],
        });
      }
    }
  });

export type GameTranslationProfile = z.infer<typeof GameTranslationProfileSchema>;
export type ContextualTerm = z.infer<typeof ContextualTermSchema>;

export type ResolvedGameContext = {
  gameId: string | null;
  displayName?: string;
  confidence: number;
  matchedBy: 'exact-name' | 'alias' | 'stream-title' | 'fallback';
};

export type MatchedTerminology = {
  sourceTerm: string;
  normalizedTerm: string;
  behavior: 'preserve' | 'preferred-translation' | 'contextual';
  preferredOutput?: string;
  startIndex: number;
  endIndex: number;
};

export type TerminologySource = 'system' | 'game-profile' | 'community' | 'user' | 'session';

export type TranslationMemoryEntry = {
  source: string;
  target: string;
  normalizedSource: string;
  gameId: string | null;
  usageCount: number;
  lastUsedAt: number;
  sourceType: 'profile' | 'provider' | 'user' | 'community';
};

export type TranslationPrompt = {
  system: string;
  user: string;
};

export type GameAwareTranslationInput = {
  currentText: string;
  previousSegments: string[];
  targetLanguage: string;
  sourceLanguage?: string;
  gameContext: ResolvedGameContext;
  gameProfile: GameTranslationProfile;
  matchedTerminology: MatchedTerminology[];
  sessionMemory: TranslationMemoryEntry[];
};
