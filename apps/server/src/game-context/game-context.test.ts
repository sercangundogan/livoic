import { describe, expect, it } from 'vitest';
import { GameProfileLoader } from './game-profile.loader.js';
import { GameResolver } from './game-resolver.js';
import { TerminologyMatcher, protectTerms, restoreTerms } from './terminology-matcher.js';
import { TranslationMemory } from './translation-memory.js';
import { TranslationValidator } from './translation-validator.js';
import { GameAwarePromptBuilder } from './prompt-builder.js';
import { createGameContextService } from './game-context.service.js';

describe('game resolver', () => {
  const loader = new GameProfileLoader();
  const resolver = new GameResolver(loader);

  it('resolves exact Path of Exile name', () => {
    const result = resolver.resolve({ gameName: 'Path of Exile' });
    expect(result.gameId).toBe('path-of-exile');
    expect(result.matchedBy).toBe('exact-name');
    expect(result.confidence).toBe(1);
  });

  it('resolves aliases case-insensitively', () => {
    const result = resolver.resolve({ gameName: 'PoE' });
    expect(result.gameId).toBe('path-of-exile');
    expect(result.matchedBy).toBe('alias');
  });

  it('falls back for unknown games', () => {
    const result = resolver.resolve({ gameName: 'Obscure Indie Title XYZ' });
    expect(result.gameId).toBeNull();
    expect(result.matchedBy).toBe('fallback');
  });

  it('can match from stream title', () => {
    const result = resolver.resolve({
      streamTitle: 'Bleed Slam League Start — Path of Exile mapping',
    });
    expect(result.gameId).toBe('path-of-exile');
    expect(result.matchedBy).toBe('stream-title');
  });
});

describe('profile validation', () => {
  it('loads and validates bundled profiles', () => {
    const loader = new GameProfileLoader();
    const profiles = loader.loadAll();
    expect(profiles.has('generic-gaming')).toBe(true);
    expect(profiles.has('path-of-exile')).toBe(true);
  });
});

describe('terminology matcher', () => {
  const loader = new GameProfileLoader();
  const matcher = new TerminologyMatcher();
  const profile = loader.get('path-of-exile')!;

  it('matches multi-word terms with longest-first behavior', () => {
    const matches = matcher.match('I dropped a Mirror of Kalandra today', profile);
    expect(matches.some((m) => m.normalizedTerm === 'Mirror of Kalandra')).toBe(true);
  });

  it('preserves Ground Slam', () => {
    const matches = matcher.match('Ground Slam is better for clear speed.', profile);
    const ground = matches.find((m) => m.normalizedTerm === 'Ground Slam');
    expect(ground?.behavior).toBe('preserve');
    const clear = matches.find((m) => m.normalizedTerm.toLowerCase() === 'clear speed');
    expect(clear?.behavior).toBe('preferred-translation');
  });

  it('protects and restores terms', () => {
    const text = 'I dropped a Divine Orb from Maven.';
    const matched = matcher.match(text, profile);
    const { maskedText, termMap } = protectTerms(text, matched);
    expect(maskedText.includes('Divine Orb')).toBe(false);
    expect(Object.keys(termMap).length).toBeGreaterThan(0);
    const restored = restoreTerms(
      maskedText.replace('__TERM_0__', '__TERM_0__').replace(/__TERM_(\d+)__/g, (_, n) => {
        return termMap[`__TERM_${n}__`] ?? `__TERM_${n}__`;
      }),
      termMap,
    );
    // simulate translation keeping placeholders
    const withPlaceholders = Object.keys(termMap).reduce(
      (acc, token) => acc.replace(termMap[token]!, token),
      text,
    );
    // better direct test:
    const fakeTranslated = maskedText; // provider kept placeholders
    const result = restoreTerms(fakeTranslated, termMap);
    expect(result.text).toContain('Divine Orb');
    expect(result.unresolved).toHaveLength(0);
    void restored;
    void withPlaceholders;
  });
});

describe('prompt builder', () => {
  it('marks previous segments as context only', () => {
    const loader = new GameProfileLoader();
    const profile = loader.get('path-of-exile')!;
    const builder = new GameAwarePromptBuilder();
    const prompt = builder.build({
      currentText: 'We are mapping for a while.',
      previousSegments: ['Okay team ready?', 'I bought a Divine Orb.'],
      targetLanguage: 'tr',
      gameContext: {
        gameId: 'path-of-exile',
        displayName: 'Path of Exile',
        confidence: 1,
        matchedBy: 'exact-name',
      },
      gameProfile: profile,
      matchedTerminology: [
        {
          sourceTerm: 'mapping',
          normalizedTerm: 'mapping',
          behavior: 'preferred-translation',
          preferredOutput: 'map dönmek',
          startIndex: 7,
          endIndex: 14,
        },
      ],
      sessionMemory: [],
    });
    expect(prompt.user).toContain('Previous context');
    expect(prompt.user).toContain('Current segment to translate');
    expect(prompt.system).toContain('must not be translated again');
    expect(prompt.user).toContain('map dönmek');
  });
});

describe('translation memory', () => {
  it('prefers profile entries and respects game isolation', () => {
    const memory = new TranslationMemory();
    memory.remember({
      source: 'build',
      target: 'build',
      normalizedSource: 'build',
      gameId: 'path-of-exile',
      usageCount: 1,
      lastUsedAt: Date.now(),
      sourceType: 'profile',
    });
    memory.remember({
      source: 'build',
      target: 'yapı',
      normalizedSource: 'build',
      gameId: 'path-of-exile',
      usageCount: 1,
      lastUsedAt: Date.now(),
      sourceType: 'provider',
    });
    const relevant = memory.getRelevantEntries('this build is cracked', 'path-of-exile');
    expect(relevant[0]?.target).toBe('build');
    expect(memory.getRelevantEntries('this build is cracked', 'valorant')).toHaveLength(0);
  });
});

describe('validator', () => {
  it('detects missing preserve terms and unresolved placeholders', () => {
    const validator = new TranslationValidator();
    const loader = new GameProfileLoader();
    const profile = loader.get('path-of-exile')!;
    const result = validator.validate({
      sourceText: 'Ground Slam is good',
      translatedText: 'Bu skill iyi Translation: test',
      matchedTerminology: [
        {
          sourceTerm: 'Ground Slam',
          normalizedTerm: 'Ground Slam',
          behavior: 'preserve',
          preferredOutput: 'Ground Slam',
          startIndex: 0,
          endIndex: 11,
        },
      ],
      profile,
    });
    expect(result.issues.some((i) => i.startsWith('missing-preserve'))).toBe(true);
  });
});

describe('game context service integration style', () => {
  it('selects PoE profile and matches mapping sentence', () => {
    const service = createGameContextService();
    const { resolvedGame, profile } = service.getTranslationContext({
      platform: 'twitch',
      gameName: 'Path of Exile',
      streamTitle: 'Bleed Slam League Start',
      detectedAt: Date.now(),
    });
    expect(resolvedGame.gameId).toBe('path-of-exile');
    expect(profile.id).toBe('path-of-exile');
    const matched = service.matchTerms(
      'We are going mapping and then fighting Maven.',
      profile,
    );
    expect(matched.some((m) => m.normalizedTerm.toLowerCase() === 'mapping')).toBe(true);
    expect(matched.some((m) => m.normalizedTerm === 'Maven')).toBe(true);
  });
});
