export type DomainTerminology = {
  source: string;
  behavior: 'preserve' | 'preferred';
  target?: string;
};

export type TranslationInput = {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  previousSegments?: string[];
  platform?: string;
  category?: string;
  /** Prepared game-aware prompt parts — providers should prefer these when present. */
  prompt?: {
    system: string;
    user: string;
  };
  domainContext?: {
    type: 'gaming' | 'general';
    name?: string;
    description?: string;
    terminology?: DomainTerminology[];
    examples?: Array<{ source: string; target: string }>;
  };
};

export type TranslationResult = {
  translatedText: string;
  sourceLanguage?: string;
  targetLanguage: string;
};

export interface TranslationProvider {
  translate(input: TranslationInput): Promise<TranslationResult>;
}
