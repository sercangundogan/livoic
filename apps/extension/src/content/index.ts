import type { ExtensionMessage } from '../shared/messages.js';
import { TwitchPlayerAdapter } from './twitch-player-adapter.js';
import { OverlayController } from './overlay-controller.js';
import { NavigationObserver } from './navigation-observer.js';

const adapter = new TwitchPlayerAdapter();
const overlay = new OverlayController(adapter);
const navigation = new NavigationObserver();

function boot(): void {
  if (!adapter.isSupportedPage()) return;
  overlay.mount();
  navigation.start(() => {
    overlay.destroy();
    // Allow Twitch to remount player, then reattach once
    setTimeout(() => overlay.mount(), 300);
  });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'popup.detectPage') {
    const meta = adapter.getPageMetadata();
    const hasPlayer = Boolean(adapter.findVideoElement() || adapter.findPlayerContainer());
    sendResponse({
      page: {
        supported: adapter.isSupportedPage(),
        platform: 'twitch' as const,
        hasPlayer: hasPlayer && Boolean(meta.channel),
        channel: meta.channel,
        title: meta.title,
        url: location.href,
      },
    });
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
