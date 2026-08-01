export const PRODUCT_NAME = 'Live Translator';
export const PRODUCT_ID = 'live-translator';

export const AUDIO = {
  encoding: 'pcm_s16le' as const,
  sampleRate: 16_000,
  channels: 1,
  chunkDurationMs: 100,
  /** Samples per chunk at 16kHz / 100ms */
  samplesPerChunk: 1_600,
  maxBufferedChunks: 50,
} as const;

export const RECONNECT = {
  delaysMs: [1_000, 2_000, 4_000, 8_000, 10_000] as const,
  maxAttempts: 5,
  heartbeatIntervalMs: 15_000,
  heartbeatTimeoutMs: 30_000,
} as const;

export const SUBTITLE = {
  targetLineLengthMin: 35,
  targetLineLengthMax: 45,
  maxVisibleLines: 2,
  minDisplayMs: 1_600,
  maxDisplayMs: 5_500,
  staleTimeoutMs: 4_000,
  contextHistorySize: 5,
} as const;

export const DEFAULT_SETTINGS = {
  targetLanguage: 'tr' as const,
  subtitleMode: 'translation' as const,
  subtitleSize: 'medium' as const,
  subtitleBackground: 'off' as const,
  subtitlePosition: 'low' as const,
};

export const SUPPORTED_LANGUAGES = [
  { code: 'tr', name: 'Türkçe', nativeName: 'Türkçe' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
] as const;

export const TWITCH_HOST_PATTERN = /^https:\/\/(www\.)?twitch\.tv\//i;

export const LANGUAGE_LABELS: Record<string, string> = {
  auto: 'Auto',
  en: 'English',
  tr: 'Turkish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
};
