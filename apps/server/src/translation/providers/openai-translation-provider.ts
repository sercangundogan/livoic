/**
 * OpenAI Chat Completions translation adapter.
 * Wire via TRANSLATION_PROVIDER=openai and OPENAI_API_KEY.
 */
import type { TranslationInput, TranslationProvider, TranslationResult } from '../translation-provider.js';

const SYSTEM_PROMPT = `You translate live stream speech for gamers.
Translate naturally, not literally. Preserve tone, usernames, item names, and game jargon.
Return ONLY the translated current segment. Do not translate prior context again.
Do not add explanations.`;

export class OpenAiTranslationProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  async translate(input: TranslationInput): Promise<TranslationResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for openai translation provider');
    }

    const context = (input.previousSegments ?? []).join('\n');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Target language: ${input.targetLanguage}\nPlatform: ${input.platform ?? 'twitch'}\nPrevious:\n${context}\n\nCurrent:\n${input.text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI translation failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const translatedText = data.choices?.[0]?.message?.content?.trim();
    if (!translatedText) throw new Error('Empty translation');

    return {
      translatedText,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
    };
  }
}

export function createOpenAiTranslationProvider(apiKey?: string): TranslationProvider {
  return new OpenAiTranslationProvider(apiKey ?? process.env.OPENAI_API_KEY ?? '');
}
