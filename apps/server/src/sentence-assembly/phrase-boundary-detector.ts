import type { PhraseBoundaryOptions, PhraseBoundaryResult } from './types.js';

function isInsideProtectedSpan(
  index: number,
  text: string,
  protectedTerms: string[],
): boolean {
  const lower = text.toLowerCase();
  for (const term of protectedTerms) {
    if (!term || !term.includes(' ')) continue;
    const needle = term.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      if (index > at && index < at + needle.length) return true;
      from = at + 1;
    }
  }
  return false;
}

function trySplitAt(
  text: string,
  pattern: RegExp,
  options: PhraseBoundaryOptions,
  preferNear: number,
): PhraseBoundaryResult | null {
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) return null;

  let best: { index: number; distance: number } | null = null;
  for (const m of matches) {
    const end = (m.index ?? 0) + m[0]!.length;
    if (end <= 0 || end >= text.length) continue;
    if (isInsideProtectedSpan(end, text, options.protectedTerms ?? [])) continue;
    const distance = Math.abs(end - preferNear);
    if (!best || distance < best.distance) {
      best = { index: end, distance };
    }
  }
  if (!best) return null;
  return {
    left: text.slice(0, best.index).trimEnd(),
    right: text.slice(best.index).trimStart(),
    splitIndex: best.index,
  };
}

/**
 * Prefer split at . ! ? then ; : then comma then " and "/" but " then word boundary near target.
 */
export function findBestSplit(
  text: string,
  options: PhraseBoundaryOptions,
): PhraseBoundaryResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const words = trimmed.split(/\s+/).filter(Boolean);
  const targetChars = Math.min(options.maxCharacters, Math.max(1, Math.floor(trimmed.length * 0.6)));
  const targetWords = Math.min(options.maxWords, Math.max(1, Math.floor(words.length * 0.6)));
  const preferNear = Math.min(
    targetChars,
    words.slice(0, targetWords).join(' ').length || targetChars,
  );

  const attempts: RegExp[] = [
    /[.!?]["')\]]*/g,
    /[;:]/g,
    /,/g,
    /\s+and\s+/gi,
    /\s+but\s+/gi,
  ];

  for (const pattern of attempts) {
    const result = trySplitAt(trimmed, pattern, options, preferNear);
    if (result && result.left.length > 0 && result.right.length > 0) {
      return result;
    }
  }

  // Safe word boundary near target
  let bestWordSplit: PhraseBoundaryResult | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < words.length - 1; i++) {
    const left = words.slice(0, i + 1).join(' ');
    const splitIndex = left.length;
    if (splitIndex <= 0 || splitIndex >= trimmed.length) continue;
    if (isInsideProtectedSpan(splitIndex + 1, trimmed, options.protectedTerms ?? [])) continue;
    const distance = Math.abs(splitIndex - preferNear);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestWordSplit = {
        left,
        right: words.slice(i + 1).join(' '),
        splitIndex,
      };
    }
  }

  return bestWordSplit;
}

export class PhraseBoundaryDetector {
  findBestSplit(text: string, options: PhraseBoundaryOptions): PhraseBoundaryResult | null {
    return findBestSplit(text, options);
  }
}
