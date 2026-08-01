import { describe, expect, it } from 'vitest';
import { GameProfileLoader } from '../game-context/game-profile.loader.js';
import type { TranslationInput } from '../translation/translation-provider.js';
import { assertNoGameContextInGeneralRoute } from './topic-routing.service.js';
import { normalizeGeneralTranscript } from './general-normalizer.js';
import { normalizeConservativeTranscript } from './conservative-normalizer.js';

const poe = new GameProfileLoader().get('path-of-exile')!;

describe('context isolation', () => {
  it('assertNoGameContextInGeneralRoute accepts clean general input', () => {
    const input: TranslationInput = {
      text: 'I went to the dentist yesterday.',
      targetLanguage: 'tr',
      domainContext: { type: 'general' },
    };
    expect(() => assertNoGameContextInGeneralRoute(input)).not.toThrow();
  });

  it('assertNoGameContextInGeneralRoute rejects gaming domainContext', () => {
    const input: TranslationInput = {
      text: 'I need more Divine Orb.',
      targetLanguage: 'tr',
      domainContext: {
        type: 'gaming',
        name: 'Path of Exile',
        terminology: [{ source: 'Divine Orb', behavior: 'preserve' }],
      },
    };
    expect(() => assertNoGameContextInGeneralRoute(input)).toThrow(/general/);
  });

  it('assertNoGameContextInGeneralRoute rejects terminology on general type', () => {
    const input: TranslationInput = {
      text: 'hello',
      targetLanguage: 'tr',
      domainContext: {
        type: 'general',
        terminology: [{ source: 'Maven', behavior: 'preserve' }],
      },
    };
    expect(() => assertNoGameContextInGeneralRoute(input)).toThrow(/terminology/);
  });

  it('general normalizer does not turn serious into Sirus', () => {
    const result = normalizeGeneralTranscript('This is serious.');
    expect(result.text).toBe('This is serious.');
    expect(result.appliedAliases).toEqual([]);
  });

  it('general normalizer leaves camera gear alone', () => {
    const result = normalizeGeneralTranscript('I bought some gear for my camera.');
    expect(result.text).toBe('I bought some gear for my camera.');
    expect(result.appliedAliases).toEqual([]);
  });

  it('conservative normalizer does not apply serious→Sirus alone', () => {
    const result = normalizeConservativeTranscript('This is serious.', poe);
    expect(result.text).toBe('This is serious.');
    expect(result.appliedAliases).toEqual([]);
  });

  it('conservative normalizer can apply alias with strong co-evidence', () => {
    const result = normalizeConservativeTranscript(
      'We are fighting the serious boss near Atlas',
      poe,
    );
    expect(result.text.toLowerCase()).toContain('sirus');
    expect(result.appliedAliases.some((a) => a.toLowerCase().includes('serious'))).toBe(true);
  });
});
