import { create } from 'zustand';
import type { LanguageCode, SessionStatus } from '@live-translator/protocol';
import type { AppError } from '@live-translator/shared';
import type { PageDetection, SessionSnapshot, UserSettings } from '../shared/messages.js';
import { DEFAULT_SETTINGS } from '@live-translator/shared';
import { sendMessage } from '../shared/messaging.js';

type PopupState = {
  status: SessionStatus;
  page: PageDetection | null;
  settings: UserSettings;
  error: AppError | null;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  audioSecondsToday: number;
  loading: boolean;
  settingsOpen: boolean;
  hydrate: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setTargetLanguage: (code: LanguageCode) => Promise<void>;
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  setSettingsOpen: (open: boolean) => void;
};

function applySnapshot(snapshot: SessionSnapshot) {
  return {
    status: snapshot.status,
    page: snapshot.page,
    error: snapshot.error,
    sourceLanguage: snapshot.sourceLanguage,
    targetLanguage: snapshot.targetLanguage,
    audioSecondsToday: snapshot.audioSecondsToday ?? 0,
  };
}

export const usePopupStore = create<PopupState>((set, get) => ({
  status: 'idle',
  page: null,
  settings: {
    targetLanguage: DEFAULT_SETTINGS.targetLanguage,
    subtitleMode: DEFAULT_SETTINGS.subtitleMode,
    subtitleSize: DEFAULT_SETTINGS.subtitleSize,
    subtitleBackground: DEFAULT_SETTINGS.subtitleBackground,
    subtitlePosition: DEFAULT_SETTINGS.subtitlePosition,
    recentLanguages: [DEFAULT_SETTINGS.targetLanguage],
  },
  error: null,
  sourceLanguage: 'auto',
  targetLanguage: DEFAULT_SETTINGS.targetLanguage,
  audioSecondsToday: 0,
  loading: true,
  settingsOpen: false,

  hydrate: async () => {
    set({ loading: true });
    const res = await sendMessage({ type: 'popup.getState' });
    if (res.ok && 'snapshot' in res) {
      set({
        ...applySnapshot(res.snapshot),
        settings: res.settings,
        targetLanguage: res.settings.targetLanguage,
        loading: false,
      });
    } else {
      set({ loading: false });
    }
  },

  start: async () => {
    set({ loading: true, error: null });
    const res = await sendMessage({
      type: 'popup.start',
      targetLanguage: get().targetLanguage,
    });
    if (res.ok && 'snapshot' in res) {
      set({
        ...applySnapshot(res.snapshot),
        settings: res.settings,
        loading: false,
      });
    } else if (!res.ok) {
      set({ error: res.error, loading: false, status: 'error' });
    }
  },

  stop: async () => {
    set({ loading: true });
    const res = await sendMessage({ type: 'popup.stop' });
    if (res.ok && 'snapshot' in res) {
      set({
        ...applySnapshot(res.snapshot),
        settings: res.settings,
        loading: false,
      });
    } else {
      set({ loading: false });
    }
  },

  setTargetLanguage: async (code) => {
    set({ targetLanguage: code });
    await get().updateSettings({ targetLanguage: code });
  },

  updateSettings: async (partial) => {
    const res = await sendMessage({ type: 'popup.updateSettings', settings: partial });
    if (res.ok && 'settings' in res) {
      set({
        settings: res.settings,
        targetLanguage: res.settings.targetLanguage,
      });
    }
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));
