import type {
  GameAwareTranslationInput,
  TranslationPrompt,
} from './types.js';

const MAX_TERMS = 12;
const MAX_EXAMPLES = 3;
const MAX_MEMORY = 5;
const MAX_PREV = 5;

export class GameAwarePromptBuilder {
  build(input: GameAwareTranslationInput): TranslationPrompt {
    const gameLabel =
      input.gameContext.displayName ??
      input.gameProfile.displayName ??
      'Unknown game';

    const terms = input.matchedTerminology.slice(0, MAX_TERMS).map((m) => {
      if (m.behavior === 'preserve') {
        return `- ${m.sourceTerm}: preserve exactly`;
      }
      if (m.behavior === 'preferred-translation' && m.preferredOutput) {
        return `- ${m.sourceTerm}: translate naturally as "${m.preferredOutput}"`;
      }
      return `- ${m.sourceTerm}: ${m.preferredOutput ? `prefer "${m.preferredOutput}"` : 'use game context'}`;
    });

    const examples = input.gameProfile.examples.slice(0, MAX_EXAMPLES);
    const memory = input.sessionMemory.slice(0, MAX_MEMORY);
    const previous = input.previousSegments.slice(-MAX_PREV);

    const system = [
      'You are a professional real-time interpreter for gaming live streams.',
      '',
      `Translate the current spoken segment into natural ${languageName(input.targetLanguage)} for viewers who understand gaming culture.`,
      '',
      `Current game: ${gameLabel}`,
      input.gameProfile.contextDescription,
      '',
      'Translation principles:',
      '- Preserve official game terminology.',
      '- Preserve item, skill, boss, character and location names.',
      '- Use the terminology commonly used by Turkish players.',
      '- Do not translate English gaming terms when Turkish players normally keep them in English.',
      '- Translate normal speech naturally.',
      '- Preserve the speaker\'s informal tone.',
      '- Do not explain terms.',
      '- Do not add notes.',
      '- Return only the translation of the current segment.',
      '- Previous segments are context only and must not be translated again.',
      '',
      'Style rules:',
      ...input.gameProfile.styleRules.map((r) => `- ${r}`),
    ].join('\n');

    const userParts = [
      terms.length
        ? `Relevant terminology for this segment:\n${terms.join('\n')}`
        : 'Relevant terminology for this segment:\n- (none matched)',
      examples.length
        ? `Examples:\n${examples.map((e) => `Source: ${e.source}\nTarget: ${e.target}`).join('\n\n')}`
        : '',
      memory.length
        ? `Session consistency memory:\n${memory.map((m) => `- ${m.source} → ${m.target}`).join('\n')}`
        : '',
      previous.length ? `Previous context:\n${previous.map((p) => `- ${p}`).join('\n')}` : 'Previous context:\n- (none)',
      `Current segment to translate:\n${input.currentText}`,
    ].filter(Boolean);

    return {
      system,
      user: userParts.join('\n\n'),
    };
  }
}

function languageName(code: string): string {
  if (code === 'tr') return 'Turkish';
  return code;
}
