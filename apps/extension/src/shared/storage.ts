import { DEFAULT_SETTINGS } from '@live-translator/shared';
import type { LanguageCode, SessionStatus } from '@live-translator/protocol';
import type { AppError } from '@live-translator/shared';
import { STORAGE_SESSION_KEYS, STORAGE_SYNC_KEYS } from './constants.js';
import type { UserSettings } from './messages.js';

export async function loadSettings(): Promise<UserSettings> {
  const data = await chrome.storage.sync.get({
    [STORAGE_SYNC_KEYS.targetLanguage]: DEFAULT_SETTINGS.targetLanguage,
    [STORAGE_SYNC_KEYS.subtitleMode]: DEFAULT_SETTINGS.subtitleMode,
    [STORAGE_SYNC_KEYS.subtitleSize]: DEFAULT_SETTINGS.subtitleSize,
    [STORAGE_SYNC_KEYS.subtitleBackground]: DEFAULT_SETTINGS.subtitleBackground,
    [STORAGE_SYNC_KEYS.subtitlePosition]: DEFAULT_SETTINGS.subtitlePosition,
    [STORAGE_SYNC_KEYS.recentLanguages]: [DEFAULT_SETTINGS.targetLanguage],
  });

  return {
    targetLanguage: data[STORAGE_SYNC_KEYS.targetLanguage] as LanguageCode,
    subtitleMode: data[STORAGE_SYNC_KEYS.subtitleMode] as UserSettings['subtitleMode'],
    subtitleSize: data[STORAGE_SYNC_KEYS.subtitleSize] as UserSettings['subtitleSize'],
    subtitleBackground: data[
      STORAGE_SYNC_KEYS.subtitleBackground
    ] as UserSettings['subtitleBackground'],
    subtitlePosition: data[STORAGE_SYNC_KEYS.subtitlePosition] as UserSettings['subtitlePosition'],
    recentLanguages: (data[STORAGE_SYNC_KEYS.recentLanguages] as LanguageCode[]) ?? ['tr'],
  };
}

export async function saveSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const current = await loadSettings();
  const next: UserSettings = { ...current, ...partial };

  if (partial.targetLanguage) {
    const recent = [
      partial.targetLanguage,
      ...current.recentLanguages.filter((l) => l !== partial.targetLanguage),
    ].slice(0, 5);
    next.recentLanguages = recent;
  }

  await chrome.storage.sync.set({
    [STORAGE_SYNC_KEYS.targetLanguage]: next.targetLanguage,
    [STORAGE_SYNC_KEYS.subtitleMode]: next.subtitleMode,
    [STORAGE_SYNC_KEYS.subtitleSize]: next.subtitleSize,
    [STORAGE_SYNC_KEYS.subtitleBackground]: next.subtitleBackground,
    [STORAGE_SYNC_KEYS.subtitlePosition]: next.subtitlePosition,
    [STORAGE_SYNC_KEYS.recentLanguages]: next.recentLanguages,
  });

  return next;
}

export type SessionMeta = {
  activeSessionId?: string;
  activeTabId?: number;
  sessionStatus?: SessionStatus;
  reconnectAttempt?: number;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
  lastError?: AppError;
  userId?: string;
  audioSecondsToday?: number;
};

export async function loadSessionMeta(): Promise<SessionMeta> {
  return (await chrome.storage.session.get(Object.values(STORAGE_SESSION_KEYS))) as SessionMeta;
}

export async function saveSessionMeta(partial: SessionMeta): Promise<void> {
  await chrome.storage.session.set(partial);
}

export async function clearSessionMeta(): Promise<void> {
  await chrome.storage.session.remove(Object.values(STORAGE_SESSION_KEYS));
}
