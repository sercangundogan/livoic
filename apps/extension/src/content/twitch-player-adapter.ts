import type { PlayerAdapter } from './player-adapter.js';

const PLAYER_SELECTORS = [
  '[data-a-target="video-player"]',
  '.video-player',
  '.persistent-player',
  '[class*="video-player__container"]',
];

const VIDEO_SELECTORS = [
  'video',
  '.video-player video',
  '[data-a-target="video-player"] video',
];

export class TwitchPlayerAdapter implements PlayerAdapter {
  isSupportedPage(): boolean {
    return location.hostname.endsWith('twitch.tv');
  }

  findPlayerContainer(): HTMLElement | null {
    for (const selector of PLAYER_SELECTORS) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) return el;
    }
    const video = this.findVideoElement();
    return video?.parentElement ?? null;
  }

  findVideoElement(): HTMLVideoElement | null {
    for (const selector of VIDEO_SELECTORS) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLVideoElement) return el;
    }
    return null;
  }

  observePlayerChanges(callback: () => void): () => void {
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        callback();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const onFullscreen = () => schedule();
    document.addEventListener('fullscreenchange', onFullscreen);

    return () => {
      observer.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }

  getPageMetadata(): { platform: string; channel?: string; title?: string } {
    const parts = location.pathname.split('/').filter(Boolean);
    const reserved = new Set([
      'directory',
      'search',
      'videos',
      'downloads',
      'inventory',
      'payments',
      'settings',
      'subscriptions',
      'wallet',
      'prime',
      'popout',
    ]);
    const channel = parts[0] && !reserved.has(parts[0]) ? parts[0] : undefined;
    const title =
      document.querySelector('[data-a-target="stream-title"]')?.textContent?.trim() ||
      document.title;
    return { platform: 'twitch', channel, title };
  }
}
