import type { SpeechToTextProvider } from './speech-provider.js';
import { MockSpeechProvider } from './mock-speech-provider.js';
import { createDeepgramSpeechProvider } from './providers/deepgram-speech-provider.js';
import { createOpenAiSpeechProvider } from './providers/openai-speech-provider.js';

export type SpeechProviderOptions = {
  name: string;
  deepgramApiKey?: string;
  openaiApiKey?: string;
  deepgramModel?: string;
};

export function createSpeechProvider(options: SpeechProviderOptions): SpeechToTextProvider {
  switch (options.name) {
    case 'deepgram':
      return createDeepgramSpeechProvider(
        options.deepgramApiKey ?? '',
        options.deepgramModel ?? 'nova-2',
      );
    case 'openai':
      return createOpenAiSpeechProvider(options.openaiApiKey ?? '');
    case 'mock':
    default:
      return new MockSpeechProvider();
  }
}

export { MockSpeechProvider };
