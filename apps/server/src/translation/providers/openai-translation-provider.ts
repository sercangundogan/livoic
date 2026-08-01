/**
 * OpenAI Chat Completions translation adapter.
 * Wire via TRANSLATION_PROVIDER=openai and OPENAI_API_KEY.
 */
import type { TranslationInput, TranslationProvider, TranslationResult } from '../translation-provider.js';

const FALLBACK_SYSTEM = `You are a professional real-time interpreter for gaming live streams.
Translate naturally into Turkish for viewers who understand gaming culture.
Preserve official game terms, item names, skill names, and common English gaming slang.
Return ONLY the translation of the current segment.
Do not explain terms. Do not add notes.`;

export class OpenAiTranslationProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  async translate(input: TranslationInput): Promise<TranslationResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for openai translation provider');
    }

    const system = input.prompt?.system ?? FALLBACK_SYSTEM;
    const user =
      input.prompt?.user ??
      buildFallbackUser(input);

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
          { role: 'system', content: system },
          { role: 'user', content: user },
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

function buildFallbackUser(input: TranslationInput): string {
  const context = (input.previousSegments ?? []).join('\n');
  const terms = (input.domainContext?.terminology ?? [])
    .slice(0, 12)
    .map((t) =>
      t.behavior === 'preserve'
        ? `- ${t.source}: preserve exactly`
        : `- ${t.source}: prefer "${t.target ?? t.source}"`,
    )
    .join('\n');

  return [
    `Target language: ${input.targetLanguage}`,
    `Platform: ${input.platform ?? 'twitch'}`,
    input.domainContext?.name ? `Game: ${input.domainContext.name}` : '',
    terms ? `Terminology:\n${terms}` : '',
    context ? `Previous context:\n${context}` : '',
    `Current segment to translate:\n${input.text}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function createOpenAiTranslationProvider(apiKey?: string): TranslationProvider {
  return new OpenAiTranslationProvider(apiKey ?? process.env.OPENAI_API_KEY ?? '');
}
