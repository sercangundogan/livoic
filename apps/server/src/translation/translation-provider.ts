export type TranslationInput = {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  previousSegments?: string[];
  platform?: string;
  category?: string;
};

export type TranslationResult = {
  translatedText: string;
  sourceLanguage?: string;
  targetLanguage: string;
};

export interface TranslationProvider {
  translate(input: TranslationInput): Promise<TranslationResult>;
}
