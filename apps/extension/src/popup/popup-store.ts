import { create } from 'zustand';
import type { LanguageCode, SessionStatus } from '@live-translator/protocol';
import type { AppError } from '@live-translator/shared';
import { DEFAULT_SETTINGS, isActiveSession } from '@live-translator/shared';
import type { GameContextInfo, PageDetection, SessionSnapshot, UserSettings } from '../shared/messages.js';
import { sendMessage } from '../shared/messaging.js';

type PopupState = {
  status: SessionStatus;
  page: PageDetection | null;
  settings: UserSettings;
  error: AppError | null;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  audioSecondsToday: number;
  gameContext: GameContextInfo | null;
  loading: boolean;
  settingsOpen: boolean;
  hydrate: (opts?: { silent?: boolean }) => Promise<void>;
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
    gameContext: snapshot.gameContext ?? null,
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
  gameContext: null,
  loading: true,
  settingsOpen: false,

  hydrate: async (opts) => {
    const silent = opts?.silent === true;
    if (!silent) set({ loading: true });
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
      // Game profile arrives shortly after session.start — refresh a few times.
      for (const delay of [300, 700, 1200, 2000, 3500]) {
        window.setTimeout(() => {
          void get().hydrate({ silent: true });
        }, delay);
      }
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

/** Keep popup in sync while open (game context arrives after start). */
export function bindPopupLiveSync(): () => void {
  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'session') return;
    if (changes.gameContext || changes.sessionStatus || changes.audioSecondsToday) {
      void usePopupStore.getState().hydrate({ silent: true });
    }
  };
  chrome.storage.onChanged.addListener(onStorage);

  const timer = window.setInterval(() => {
    const { status } = usePopupStore.getState();
    if (isActiveSession(status) || status === 'connecting' || status === 'requesting-permission') {
      void usePopupStore.getState().hydrate({ silent: true });
    }
  }, 1500);

  return () => {
    chrome.storage.onChanged.removeListener(onStorage);
    window.clearInterval(timer);
  };
}
