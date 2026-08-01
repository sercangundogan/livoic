import { TWITCH_HOST_PATTERN } from '@live-translator/shared';
import type { PageDetection } from './messages.js';

export function detectPageFromUrl(url: string): PageDetection {
  const supported = TWITCH_HOST_PATTERN.test(url);
  if (!supported) {
    return {
      supported: false,
      platform: 'unknown',
      hasPlayer: false,
      url,
    };
  }

  let channel: string | undefined;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    // twitch.tv/<channel> — skip directory/search/etc.
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
    ]);
    if (parts[0] && !reserved.has(parts[0]) && parts[0] !== 'popout') {
      channel = parts[0];
    }
  } catch {
    // ignore
  }

  return {
    supported: true,
    platform: 'twitch',
    hasPlayer: Boolean(channel),
    channel,
    url,
  };
}

export function isTwitchStreamUrl(url: string): boolean {
  const page = detectPageFromUrl(url);
  return page.supported && Boolean(page.channel);
}
