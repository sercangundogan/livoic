import type { TranslationInput, TranslationProvider, TranslationResult } from './translation-provider.js';
import { createOpenAiTranslationProvider } from './providers/openai-translation-provider.js';

const TR_MAP: Record<string, string> = {
  "We're starting the new map now.": 'Şimdi yeni haritaya başlıyoruz.',
  'Bro, this build is actually cracked.': 'Dostum, bu build gerçekten aşırı güçlü.',
  'Watch out for the flank on the left.': 'Soldan flank’e dikkat et.',
  'Okay team, push mid with me.': 'Tamam takım, benimle mid’e basın.',
  'That was a clean play, nice job.': 'Çok temiz bir play’di, aferin.',
  'I need to buy armor before the next round.': 'Bir sonraki round’dan önce armor almam lazım.',
  "He's one HP, finish him.": 'Bir HP’si kaldı, bitirin onu.',
  "We're going into the boss fight now.": 'Şimdi boss savaşına giriyoruz.',
};

const DE_MAP: Record<string, string> = {
  "We're starting the new map now.": 'Wir starten jetzt die neue Map.',
  'Bro, this build is actually cracked.': 'Bro, dieser Build ist echt broken.',
};

function translateWithMap(
  text: string,
  map: Record<string, string>,
  targetLanguage: string,
): string {
  if (map[text]) return map[text]!;
  return `[${targetLanguage}] ${text}`;
}

export class MockTranslationProvider implements TranslationProvider {
  async translate(input: TranslationInput): Promise<TranslationResult> {
    await new Promise((r) => setTimeout(r, 80));

    if (input.targetLanguage === 'en') {
      return {
        translatedText: input.text,
        sourceLanguage: input.sourceLanguage ?? 'en',
        targetLanguage: 'en',
      };
    }

    const map = input.targetLanguage === 'de' ? DE_MAP : TR_MAP;
    return {
      translatedText: translateWithMap(input.text, map, input.targetLanguage),
      sourceLanguage: input.sourceLanguage ?? 'en',
      targetLanguage: input.targetLanguage,
    };
  }
}

export function createTranslationProvider(
  name: string,
  apiKey?: string,
): TranslationProvider {
  if (name === 'openai') {
    return createOpenAiTranslationProvider(apiKey);
  }
  return new MockTranslationProvider();
}
