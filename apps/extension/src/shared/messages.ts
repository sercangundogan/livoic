import type {
  AppErrorCode,
  LanguageCode,
  SessionStatus,
  StreamContext,
  SubtitleBackground,
  SubtitleMode,
  SubtitlePosition,
  SubtitleSize,
  ServerEvent,
} from '@live-translator/protocol';
import type { AppError } from '@live-translator/shared';

export type PageDetection = {
  supported: boolean;
  platform: 'twitch' | 'unknown';
  hasPlayer: boolean;
  channel?: string;
  title?: string;
  gameName?: string;
  gameSlug?: string;
  url: string;
};

export type GameContextInfo = {
  id: string | null;
  displayName?: string;
  profileApplied: boolean;
  confidence?: number;
};

export type UserSettings = {
  targetLanguage: LanguageCode;
  subtitleMode: SubtitleMode;
  subtitleSize: SubtitleSize;
  subtitleBackground: SubtitleBackground;
  subtitlePosition: SubtitlePosition;
  recentLanguages: LanguageCode[];
};

export type SessionSnapshot = {
  sessionId: string | null;
  tabId: number | null;
  status: SessionStatus;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  error: AppError | null;
  page: PageDetection | null;
  audioSecondsToday?: number;
  gameContext?: GameContextInfo | null;
};

export type ExtensionMessage =
  | { type: 'popup.getState' }
  | { type: 'popup.start'; targetLanguage: LanguageCode }
  | { type: 'popup.stop' }
  | { type: 'popup.updateSettings'; settings: Partial<UserSettings> }
  | { type: 'popup.detectPage' }
  | { type: 'content.pageInfo'; page: PageDetection }
  | { type: 'content.streamContext'; streamContext: StreamContext }
  | { type: 'content.ready' }
  | {
      type: 'overlay.subtitle';
      payload: {
        segmentId: string;
        sourceText?: string;
        translatedText?: string;
        partial?: boolean;
      };
    }
  | { type: 'overlay.clear' }
  | { type: 'overlay.status'; status: SessionStatus; message?: string }
  | { type: 'overlay.updateSettings'; settings: Partial<UserSettings> }
  | { type: 'session.state'; snapshot: SessionSnapshot }
  | {
      type: 'offscreen.start';
      streamId: string;
      sessionId: string;
      targetLanguage: LanguageCode;
      apiBase: string;
      streamContext?: StreamContext;
    }
  | { type: 'offscreen.stop' }
  | { type: 'offscreen.status'; status: SessionStatus; message?: string }
  | { type: 'offscreen.serverEvent'; event: ServerEvent }
  | { type: 'offscreen.streamContext'; streamContext: StreamContext }
  | { type: 'offscreen.error'; code: AppErrorCode; message: string }
  | { type: 'dev.ping' };

export type ExtensionResponse =
  | { ok: true; snapshot: SessionSnapshot; settings: UserSettings }
  | { ok: true }
  | { ok: false; error: AppError };
