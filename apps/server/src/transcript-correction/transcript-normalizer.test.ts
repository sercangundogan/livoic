import { describe, expect, it } from 'vitest';
import { GameProfileLoader } from '../game-context/game-profile.loader.js';
import { normalizeTranscript } from './transcript-normalizer.js';

describe('normalizeTranscript', () => {
  const loader = new GameProfileLoader();
  const profile = loader.get('path-of-exile')!;

  it('does not replace serious alone with Sirus', () => {
    const result = normalizeTranscript('this is serious', profile);
    expect(result.text).toBe('this is serious');
    expect(result.appliedAliases).toHaveLength(0);
  });

  it('restores serious → Sirus with fight context', () => {
    const result = normalizeTranscript('we are fighting serious soon', profile);
    expect(result.text).toBe('we are fighting Sirus soon');
    expect(result.appliedAliases.some((a) => a.includes('serious→Sirus'))).toBe(true);
  });

  it('restores serious → Sirus with boss fight context', () => {
    const result = normalizeTranscript('boss fight against serious', profile);
    expect(result.text).toBe('boss fight against Sirus');
  });

  it('does not replace seriously (word boundary)', () => {
    const result = normalizeTranscript('seriously though', profile);
    expect(result.text).toBe('seriously though');
    expect(result.appliedAliases).toHaveLength(0);
  });

  it('restores multi-word head hunter → Headhunter', () => {
    const result = normalizeTranscript('I equipped a head hunter belt', profile);
    expect(result.text).toBe('I equipped a Headhunter belt');
  });

  it('restores mage blood → Mageblood', () => {
    const result = normalizeTranscript('crafted a mage blood finally', profile);
    expect(result.text).toBe('crafted a Mageblood finally');
  });

  it('returns unchanged text without profile aliases', () => {
    const result = normalizeTranscript('boss fight against serious', undefined);
    expect(result.text).toBe('boss fight against serious');
  });
});
