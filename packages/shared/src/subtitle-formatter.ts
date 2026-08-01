import { SUBTITLE } from './constants.js';

export type FormattedSubtitle = {
  lines: string[];
  displayMs: number;
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitAtPunctuation(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    const window = remaining.slice(0, maxLen + 1);
    const punctIdx = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('? '),
      window.lastIndexOf('! '),
      window.lastIndexOf(', '),
      window.lastIndexOf('; '),
      window.lastIndexOf(' '),
    );

    let cut = punctIdx > maxLen * 0.4 ? punctIdx + 1 : maxLen;
    // Avoid orphan single words on the next line when possible
    const candidate = remaining.slice(0, cut).trim();
    const rest = remaining.slice(cut).trim();
    if (rest.split(' ').length === 1 && candidate.includes(' ')) {
      const lastSpace = candidate.lastIndexOf(' ');
      cut = lastSpace;
    }

    const line = remaining.slice(0, cut).trim();
    if (line) lines.push(line);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) lines.push(remaining);
  return lines;
}

export function formatSubtitleText(
  text: string,
  options?: { maxLines?: number; targetLength?: number },
): FormattedSubtitle {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) {
    return { lines: [], displayMs: SUBTITLE.minDisplayMs };
  }

  const maxLines = options?.maxLines ?? SUBTITLE.maxVisibleLines;
  const targetLength = options?.targetLength ?? SUBTITLE.targetLineLengthMax;
  let lines = splitAtPunctuation(cleaned, targetLength);

  if (lines.length > maxLines) {
    // Merge overflow into last allowed line rather than dropping meaning
    const head = lines.slice(0, maxLines - 1);
    const tail = lines.slice(maxLines - 1).join(' ');
    lines = [...head, tail];
  }

  const charCount = cleaned.length;
  const displayMs = Math.min(
    SUBTITLE.maxDisplayMs,
    Math.max(SUBTITLE.minDisplayMs, Math.round(charCount * 55)),
  );

  return { lines, displayMs };
}

export function mergeShortSegments(segments: string[], minChars = 12): string[] {
  const merged: string[] = [];
  let buffer = '';

  for (const segment of segments) {
    const next = normalizeWhitespace(segment);
    if (!next) continue;
    if (!buffer) {
      buffer = next;
      continue;
    }
    if (buffer.length < minChars) {
      buffer = `${buffer} ${next}`;
    } else {
      merged.push(buffer);
      buffer = next;
    }
  }
  if (buffer) merged.push(buffer);
  return merged;
}

export function isDuplicateFinal(previous: string | undefined, next: string): boolean {
  if (!previous) return false;
  return normalizeWhitespace(previous).toLowerCase() === normalizeWhitespace(next).toLowerCase();
}

export function buildTranslationContext(
  previousSegments: string[],
  currentSegment: string,
  options: {
    targetLanguage: string;
    sourceLanguage?: string;
    platform?: string;
    category?: string;
  },
) {
  return {
    previousSegments: previousSegments.slice(-SUBTITLE.contextHistorySize),
    currentSegment: normalizeWhitespace(currentSegment),
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    platform: options.platform ?? 'twitch',
    category: options.category,
  };
}
