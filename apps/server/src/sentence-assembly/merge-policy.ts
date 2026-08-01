import type { TranscriptTopic } from '../topic-routing/types.js';

const FILLER_ONLY_RE =
  /^(uh+|um+|uhm+|erm+|hmm+|yeah|yep|yup|like|you know|i mean|so|okay|ok|alright|mhm|mm+|ah+|oh+)\.?$/i;

const RESTART_MARKERS_RE =
  /^(actually|no[,.]?\s|wait[,.]?\s|i mean[,.]?\s|sorry[,.]?\s|let me\b|rather[,.]?\s)/i;

const DISCOURSE_RESET_RE =
  /^(okay\b|alright\b|anyway\b|by the way\b|chat\b|now\b|next\b|let'?s\b|so[,.]?\s+moving on\b)/i;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function isFillerOnly(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return true;
  return FILLER_ONLY_RE.test(normalized);
}

export function isRestartMarker(text: string): boolean {
  return RESTART_MARKERS_RE.test(text.trim());
}

export function isDiscourseReset(text: string): boolean {
  return DISCOURSE_RESET_RE.test(text.trim());
}

/**
 * game↔general is incompatible. uncertain is compatible with either side
 * (merge still requires score/evidence).
 */
export function topicsCompatible(a: TranscriptTopic, b: TranscriptTopic): boolean {
  if (a === 'uncertain' || b === 'uncertain') return true;
  return a === b;
}

export function hasTerminalPunctuation(text: string): boolean {
  return /[.!?…]["')\]]*\s*$/.test(text.trim());
}

export function endsWithBrokenWord(text: string): boolean {
  return /[A-Za-z]-$/.test(text.trim());
}

export function startsLowercaseContinuation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const first = trimmed[0]!;
  return first === first.toLowerCase() && /[a-z]/.test(first);
}
