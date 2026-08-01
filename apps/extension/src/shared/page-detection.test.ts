import { describe, expect, it } from 'vitest';
import { detectPageFromUrl, isTwitchStreamUrl } from './page-detection.js';

describe('page detection', () => {
  it('detects twitch channel pages', () => {
    const page = detectPageFromUrl('https://www.twitch.tv/shroud');
    expect(page.supported).toBe(true);
    expect(page.platform).toBe('twitch');
    expect(page.channel).toBe('shroud');
    expect(page.hasPlayer).toBe(true);
    expect(isTwitchStreamUrl('https://www.twitch.tv/shroud')).toBe(true);
  });

  it('rejects non-twitch pages', () => {
    const page = detectPageFromUrl('https://www.youtube.com/watch?v=1');
    expect(page.supported).toBe(false);
    expect(isTwitchStreamUrl('https://www.youtube.com/watch?v=1')).toBe(false);
  });

  it('treats twitch directory as no active stream', () => {
    const page = detectPageFromUrl('https://www.twitch.tv/directory');
    expect(page.supported).toBe(true);
    expect(page.hasPlayer).toBe(false);
  });
});
