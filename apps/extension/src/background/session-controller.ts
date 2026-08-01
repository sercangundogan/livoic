import type { LanguageCode, SessionStatus } from '@live-translator/protocol';
import { createAppError, isActiveSession, transition } from '@live-translator/shared';
import type { AppError } from '@live-translator/shared';
import { API_BASE, OFFSCREEN_JUSTIFICATION, OFFSCREEN_REASONS, OFFSCREEN_URL } from '../shared/constants.js';
import type { ExtensionMessage, PageDetection, SessionSnapshot, UserSettings } from '../shared/messages.js';
import { detectPageFromUrl } from '../shared/page-detection.js';
import { sendTabMessage } from '../shared/messaging.js';
import {
  clearSessionMeta,
  loadSessionMeta,
  loadSettings,
  saveSessionMeta,
  saveSettings,
} from '../shared/storage.js';

export class SessionController {
  private status: SessionStatus = 'idle';
  private sessionId: string | null = null;
  private tabId: number | null = null;
  private error: AppError | null = null;
  private page: PageDetection | null = null;
  private sourceLanguage: LanguageCode = 'auto';
  private targetLanguage: LanguageCode = 'tr';
  private settings: UserSettings | null = null;
  private audioSecondsToday = 0;

  async init(): Promise<void> {
    this.settings = await loadSettings();
    this.targetLanguage = this.settings.targetLanguage;
    const meta = await loadSessionMeta();
    if (meta.sessionStatus) this.status = meta.sessionStatus;
    if (meta.activeSessionId) this.sessionId = meta.activeSessionId;
    if (meta.activeTabId) this.tabId = meta.activeTabId;
    if (meta.targetLanguage) this.targetLanguage = meta.targetLanguage;
    if (meta.sourceLanguage) this.sourceLanguage = meta.sourceLanguage;
    if (meta.lastError) this.error = meta.lastError;
    if (typeof meta.audioSecondsToday === 'number') this.audioSecondsToday = meta.audioSecondsToday;
  }

  getSnapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      tabId: this.tabId,
      status: this.status,
      sourceLanguage: this.sourceLanguage,
      targetLanguage: this.targetLanguage,
      error: this.error,
      page: this.page,
      audioSecondsToday: this.audioSecondsToday,
    };
  }

  async getSettings(): Promise<UserSettings> {
    this.settings = await loadSettings();
    return this.settings;
  }

  async updateSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
    this.settings = await saveSettings(partial);
    if (partial.targetLanguage) this.targetLanguage = partial.targetLanguage;
    if (this.tabId != null) {
      await sendTabMessage(this.tabId, {
        type: 'overlay.updateSettings',
        settings: partial,
      });
    }
    return this.settings;
  }

  async detectActiveTab(): Promise<SessionSnapshot> {
    this.setStatus('detecting');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      this.page = {
        supported: false,
        platform: 'unknown',
        hasPlayer: false,
        url: '',
      };
      this.setStatus('idle');
      this.error = createAppError('UNSUPPORTED_PAGE');
      return this.getSnapshot();
    }

    this.tabId = tab.id;
    this.page = detectPageFromUrl(tab.url);

    // Ask content script for richer player info when on Twitch
    if (this.page.supported) {
      const info = (await sendTabMessage(tab.id, { type: 'popup.detectPage' })) as
        | { page?: PageDetection }
        | undefined;
      if (info?.page) this.page = info.page;
    }

    if (!this.page.supported) {
      this.error = createAppError('UNSUPPORTED_PAGE');
      this.setStatus('idle');
    } else if (!this.page.hasPlayer) {
      this.error = createAppError('PLAYER_NOT_FOUND');
      this.setStatus('idle');
    } else if (!isActiveSession(this.status)) {
      this.error = null;
      this.setStatus('ready');
    }

    await this.persist();
    return this.getSnapshot();
  }

  async start(targetLanguage: LanguageCode): Promise<SessionSnapshot> {
    await this.detectActiveTab();
    if (!this.page?.supported || !this.page.hasPlayer || this.tabId == null) {
      this.error = createAppError(
        this.page?.supported ? 'PLAYER_NOT_FOUND' : 'UNSUPPORTED_PAGE',
      );
      this.setStatus('error');
      await this.persist();
      return this.getSnapshot();
    }

    this.targetLanguage = targetLanguage;
    await saveSettings({ targetLanguage });
    this.error = null;
    this.setStatus('requesting-permission');
    this.sessionId = crypto.randomUUID();
    await this.persist();

    try {
      const streamId = await this.getMediaStreamId(this.tabId);
      this.setStatus('connecting');
      await this.persist();
      await this.ensureOffscreen();

      await chrome.runtime.sendMessage({
        type: 'offscreen.start',
        streamId,
        sessionId: this.sessionId,
        targetLanguage,
        apiBase: API_BASE,
      } satisfies ExtensionMessage);

      if (this.tabId != null) {
        await sendTabMessage(this.tabId, {
          type: 'overlay.status',
          status: 'connecting',
        });
        const settings = await this.getSettings();
        await sendTabMessage(this.tabId, {
          type: 'overlay.updateSettings',
          settings,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('active tab')) {
        this.error = createAppError('CAPTURE_PERMISSION_DENIED');
      } else {
        this.error = createAppError('AUDIO_CAPTURE_FAILED', { detail: message });
      }
      this.setStatus('error');
      await this.cleanupCapture();
      await this.persist();
    }

    return this.getSnapshot();
  }

  async stop(): Promise<SessionSnapshot> {
    this.setStatus('stopping');
    await this.persist();
    try {
      await chrome.runtime.sendMessage({ type: 'offscreen.stop' } satisfies ExtensionMessage);
    } catch {
      // offscreen may already be gone
    }
    await this.cleanupCapture();
    if (this.tabId != null) {
      await sendTabMessage(this.tabId, { type: 'overlay.clear' });
      await sendTabMessage(this.tabId, { type: 'overlay.status', status: 'stopped' });
    }
    this.setStatus('stopped');
    this.sessionId = null;
    await clearSessionMeta();
    this.setStatus('ready');
    await this.persist();
    return this.getSnapshot();
  }

  async handleOffscreenStatus(status: SessionStatus, message?: string): Promise<void> {
    if (status === 'listening' || status === 'reconnecting' || status === 'error') {
      this.setStatus(status);
      if (status === 'error') {
        this.error = createAppError('BACKEND_UNAVAILABLE', { detail: message });
      }
      await this.persist();
      if (this.tabId != null) {
        await sendTabMessage(this.tabId, { type: 'overlay.status', status, message });
      }
    }
  }

  async handleServerEvent(event: import('@live-translator/protocol').ServerEvent): Promise<void> {
    if (this.tabId == null) return;

    if (event.type === 'usage.update') {
      this.audioSecondsToday = event.audioSecondsToday ?? event.audioSeconds;
      await this.persist();
    }

    if (event.type === 'transcript.partial') {
      await sendTabMessage(this.tabId, {
        type: 'overlay.subtitle',
        payload: {
          segmentId: event.segmentId,
          sourceText: event.text,
          partial: true,
        },
      });
    }

    if (event.type === 'translation.final') {
      await sendTabMessage(this.tabId, {
        type: 'overlay.subtitle',
        payload: {
          segmentId: event.segmentId,
          sourceText: event.sourceText,
          translatedText: event.translatedText,
          partial: false,
        },
      });
    }

    if (event.type === 'error') {
      this.error = createAppError(event.code, { message: event.message });
      if (!event.recoverable) this.setStatus('error');
      await this.persist();
      await sendTabMessage(this.tabId, {
        type: 'overlay.status',
        status: this.status,
        message: event.message,
      });
    }

    if (event.type === 'session.status' && event.status === 'listening') {
      this.setStatus('listening');
      await this.persist();
      await sendTabMessage(this.tabId, { type: 'overlay.status', status: 'listening' });
    }
  }

  async handleTabRemoved(tabId: number): Promise<void> {
    if (this.tabId === tabId && isActiveSession(this.status)) {
      await this.stop();
    }
  }

  async handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo): Promise<void> {
    if (this.tabId !== tabId || !changeInfo.url) return;
    const page = detectPageFromUrl(changeInfo.url);
    this.page = page;
    if (!page.supported || !page.channel) {
      if (isActiveSession(this.status)) await this.stop();
    }
  }

  private setStatus(next: SessionStatus): void {
    const result = transition(this.status, next);
    if (result.ok) {
      this.status = result.status;
    } else if (next === 'error' || next === 'stopped' || next === 'idle') {
      // Force critical escapes
      this.status = next;
    }
  }

  private async persist(): Promise<void> {
    await saveSessionMeta({
      activeSessionId: this.sessionId ?? undefined,
      activeTabId: this.tabId ?? undefined,
      sessionStatus: this.status,
      sourceLanguage: this.sourceLanguage,
      targetLanguage: this.targetLanguage,
      lastError: this.error ?? undefined,
      audioSecondsToday: this.audioSecondsToday,
    });
  }

  private async getMediaStreamId(tabId: number): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'No stream id'));
          return;
        }
        resolve(streamId);
      });
    });
  }

  private async ensureOffscreen(): Promise<void> {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    });
    if (existing.length > 0) return;

    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: OFFSCREEN_REASONS as unknown as chrome.offscreen.Reason[],
      justification: OFFSCREEN_JUSTIFICATION,
    });
    // Allow the offscreen module to register its message listener before we message it.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  private async cleanupCapture(): Promise<void> {
    try {
      const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
      });
      if (existing.length > 0) {
        await chrome.offscreen.closeDocument();
      }
    } catch {
      // ignore
    }
  }
}
