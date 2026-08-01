import type { StreamContext } from '@live-translator/protocol';
import type { ExtensionMessage } from '../shared/messages.js';
import { TwitchPlayerAdapter } from './twitch-player-adapter.js';
import { OverlayController } from './overlay-controller.js';
import { NavigationObserver } from './navigation-observer.js';

const adapter = new TwitchPlayerAdapter();
const overlay = new OverlayController(adapter);
const navigation = new NavigationObserver();

let lastGameKey = '';

function readStreamContextFromMeta(meta: {
  channel?: string;
  title?: string;
  gameName?: string;
  gameSlug?: string;
}): StreamContext {
  return {
    platform: 'twitch',
    channelName: meta.channel,
    streamTitle: meta.title,
    gameName: meta.gameName,
    gameSlug: meta.gameSlug,
    detectedAt: Date.now(),
  };
}

function maybeEmitStreamContext(meta?: {
  channel?: string;
  title?: string;
  gameName?: string;
  gameSlug?: string;
}): void {
  const resolved = meta ?? adapter.getPageMetadata();
  const ctx = readStreamContextFromMeta(resolved);
  const key = `${ctx.channelName ?? ''}|${ctx.gameName ?? ''}|${ctx.gameSlug ?? ''}|${ctx.streamTitle ?? ''}`;
  if (key === lastGameKey) return;
  lastGameKey = key;
  void chrome.runtime.sendMessage({
    type: 'content.streamContext',
    streamContext: ctx,
  } satisfies ExtensionMessage);
}

async function refreshStreamContextAsync(): Promise<void> {
  const meta = await adapter.getPageMetadataAsync();
  maybeEmitStreamContext(meta);
}

function boot(): void {
  if (!adapter.isSupportedPage()) return;
  overlay.mount();
  lastGameKey = '';
  maybeEmitStreamContext();
  void refreshStreamContextAsync();

  navigation.start(() => {
    overlay.destroy();
    setTimeout(() => {
      overlay.mount();
      lastGameKey = '';
      maybeEmitStreamContext();
      void refreshStreamContextAsync();
    }, 300);
  });

  // Twitch SPA can change category without a full navigation event.
  const stopPlayerObserve = adapter.observePlayerChanges(() => {
    maybeEmitStreamContext();
  });
  window.addEventListener('beforeunload', () => stopPlayerObserve());
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'popup.detectPage') {
    void (async () => {
      const meta = await adapter.getPageMetadataAsync();
      const hasPlayer = Boolean(adapter.findVideoElement() || adapter.findPlayerContainer());
      sendResponse({
        page: {
          supported: adapter.isSupportedPage(),
          platform: 'twitch' as const,
          hasPlayer: hasPlayer && Boolean(meta.channel),
          channel: meta.channel,
          title: meta.title,
          gameName: meta.gameName,
          gameSlug: meta.gameSlug,
          url: location.href,
        },
      });
    })();
    return true;
  }

  if (message.type === 'overlay.subtitle') {
    overlay.showSubtitle(message.payload);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'overlay.clear') {
    overlay.clear();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'overlay.status') {
    overlay.setStatus(message.status, message.message);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'overlay.updateSettings') {
    overlay.updateSettings(message.settings);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
