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

const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

export class TwitchPlayerAdapter implements PlayerAdapter {
  private gqlGameCache: { gameName?: string; gameSlug?: string } | null = null;
  private gqlCachedChannel: string | null = null;
  private gqlInflight: Promise<{ gameName?: string; gameSlug?: string }> | null = null;

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

  getPageMetadata(): {
    platform: string;
    channel?: string;
    title?: string;
    gameName?: string;
    gameSlug?: string;
  } {
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

    const game = this.detectGame();
    if (channel && this.gqlCachedChannel && this.gqlCachedChannel !== channel) {
      this.gqlGameCache = null;
      this.gqlCachedChannel = null;
    }
    if ((!game.gameName || !game.gameSlug) && channel) {
      void this.ensureGqlGame(channel);
      if (this.gqlGameCache?.gameName && this.gqlCachedChannel === channel) {
        return {
          platform: 'twitch',
          channel,
          title,
          gameName: game.gameName || this.gqlGameCache.gameName,
          gameSlug: game.gameSlug || this.gqlGameCache.gameSlug,
        };
      }
    }

    return {
      platform: 'twitch',
      channel,
      title,
      gameName: game.gameName,
      gameSlug: game.gameSlug,
    };
  }

  /** Prefer DOM; fall back to Twitch web GQL (same Client-ID the site uses). */
  async getPageMetadataAsync(): Promise<{
    platform: string;
    channel?: string;
    title?: string;
    gameName?: string;
    gameSlug?: string;
  }> {
    const base = this.getPageMetadata();
    if (base.gameName || !base.channel) return base;
    const gql = await this.ensureGqlGame(base.channel);
    return {
      ...base,
      gameName: gql.gameName,
      gameSlug: gql.gameSlug,
    };
  }

  private detectGame(): { gameName?: string; gameSlug?: string } {
    const selectors = [
      'a[data-a-target="stream-game-link"]',
      '[data-a-target="stream-game-link"]',
      'a[data-a-target="game-name-link"]',
      '[data-test-selector="stream-info-card-component__subtitle"] a',
      'p[data-a-target="stream-game-link"]',
      '[data-a-target="about-panel-game"] a',
      'a[href*="/directory/category/"]',
      'a[href*="/directory/game/"]',
    ];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const el of nodes) {
        if (!(el instanceof HTMLElement)) continue;
        const gameName = el.textContent?.trim();
        if (!gameName || gameName.length < 2) continue;

        if (el instanceof HTMLAnchorElement && el.href) {
          try {
            const url = new URL(el.href);
            const parts = url.pathname.split('/').filter(Boolean);
            const isCategory =
              (parts[0] === 'directory' && (parts[1] === 'category' || parts[1] === 'game')) ||
              parts.includes('category');
            if (!isCategory && selector.includes('href*')) continue;

            let gameSlug: string | undefined;
            const categoryIdx = parts.indexOf('category');
            if (categoryIdx >= 0 && parts[categoryIdx + 1] === 'game' && parts[categoryIdx + 2]) {
              gameSlug = decodeURIComponent(parts[categoryIdx + 2]!);
            } else if (parts[0] === 'directory' && parts[1] === 'category' && parts[2]) {
              gameSlug = decodeURIComponent(parts[2]!);
            } else if (parts[0] === 'directory' && parts[1] === 'game' && parts[2]) {
              gameSlug = decodeURIComponent(parts[2]!);
            }
            return { gameName, gameSlug };
          } catch {
            return { gameName };
          }
        }
        return { gameName };
      }
    }

    const ogDescription = document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content');
    if (ogDescription?.toLowerCase().includes('playing')) {
      const match = ogDescription.match(/playing\s+(.+?)(?:\s+on Twitch|$)/i);
      if (match?.[1]) return { gameName: match[1].trim() };
    }

    return {};
  }

  private ensureGqlGame(channel: string): Promise<{ gameName?: string; gameSlug?: string }> {
    if (this.gqlGameCache?.gameName && this.gqlCachedChannel === channel) {
      return Promise.resolve(this.gqlGameCache);
    }
    if (this.gqlInflight && this.gqlCachedChannel === channel) return this.gqlInflight;

    this.gqlCachedChannel = channel;
    this.gqlInflight = (async () => {
      try {
        const res = await fetch('https://gql.twitch.tv/gql', {
          method: 'POST',
          headers: {
            'Client-ID': TWITCH_WEB_CLIENT_ID,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `query($login:String!){user(login:$login){stream{game{name,slug}}broadcastSettings{game{name,slug}}}}`,
            variables: { login: channel },
          }),
        });
        if (!res.ok) return {};
        const json = (await res.json()) as {
          data?: {
            user?: {
              stream?: { game?: { name?: string; slug?: string } | null } | null;
              broadcastSettings?: { game?: { name?: string; slug?: string } | null } | null;
            } | null;
          };
        };
        const game =
          json.data?.user?.stream?.game ?? json.data?.user?.broadcastSettings?.game ?? null;
        const result = {
          gameName: game?.name || undefined,
          gameSlug: game?.slug || undefined,
        };
        if (result.gameName) this.gqlGameCache = result;
        return result;
      } catch {
        return {};
      } finally {
        this.gqlInflight = null;
      }
    })();

    return this.gqlInflight;
  }
}
