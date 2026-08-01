export const API_BASE = typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : 'http://127.0.0.1:4000';

export const OFFSCREEN_URL = 'offscreen.html';
export const OFFSCREEN_REASONS = ['USER_MEDIA' as const, 'AUDIO_PLAYBACK' as const];
export const OFFSCREEN_JUSTIFICATION =
  'Capture and process tab audio for real-time speech translation while preserving playback.';

export const STORAGE_SYNC_KEYS = {
  targetLanguage: 'targetLanguage',
  subtitleMode: 'subtitleMode',
  subtitleSize: 'subtitleSize',
  subtitleBackground: 'subtitleBackground',
  subtitlePosition: 'subtitlePosition',
  recentLanguages: 'recentLanguages',
} as const;

export const STORAGE_SESSION_KEYS = {
  activeSessionId: 'activeSessionId',
  activeTabId: 'activeTabId',
  sessionStatus: 'sessionStatus',
  reconnectAttempt: 'reconnectAttempt',
  sourceLanguage: 'sourceLanguage',
  targetLanguage: 'targetLanguage',
  lastError: 'lastError',
  userId: 'userId',
  audioSecondsToday: 'audioSecondsToday',
} as const;
