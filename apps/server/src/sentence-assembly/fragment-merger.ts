import {
  countWords,
  endsWithBrokenWord,
  hasTerminalPunctuation,
  isDiscourseReset,
  isRestartMarker,
  startsLowercaseContinuation,
  topicsCompatible,
} from './merge-policy.js';
import type {
  FragmentMergeDecision,
  FragmentMergeInput,
  FragmentMergeReason,
  PendingUtterance,
  RawTranscriptSegment,
} from './types.js';

const CONTINUATION_STARTS = [
  'because',
  'but',
  'and',
  'so',
  'which',
  'that',
  'to',
  'with',
  'for',
  'on',
  'in',
  'needs',
  'has',
  'is',
  'was',
  'would',
  'could',
  'should',
] as const;

function firstToken(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return (trimmed.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z']/gi, '');
}

function joinTexts(left: string, right: string): string {
  const a = left.trimEnd();
  const b = right.trimStart();
  if (!a) return b;
  if (!b) return a;

  // Broken word join: "supp-" + "ression" → "suppression"
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/i.test(b)) {
    return `${a.slice(0, -1)}${b}`.replace(/\s+/g, ' ').trim();
  }

  // Drop trailing continuation ellipsis / dash before lowercase continuation
  const cleanedA = a.replace(/(\.\.\.|…|—|-)\s*$/u, '').trimEnd();
  const joined = `${cleanedA} ${b}`.replace(/\s+/g, ' ').trim();
  return joined;
}

export class FragmentMerger {
  shouldMerge(input: FragmentMergeInput): FragmentMergeDecision {
    const reasons: FragmentMergeReason[] = [];
    let score = 0;
    let denied = false;

    if (input.gapMs >= input.hardGapMs) {
      reasons.push('long-time-gap');
      denied = true;
    }

    if (!topicsCompatible(input.pending.preliminaryTopic, input.nextTopic)) {
      reasons.push('topic-conflict');
      denied = true;
    }

    if (isRestartMarker(input.next.text)) {
      reasons.push('restart-marker');
      denied = true;
    }

    if (isDiscourseReset(input.next.text)) {
      reasons.push('discourse-reset');
      denied = true;
    }

    if (
      input.pending.completeness === 'complete' &&
      hasTerminalPunctuation(input.pending.combinedText) &&
      input.gapMs > input.shortGapMs
    ) {
      reasons.push('previous-complete');
      denied = true;
    }

    if (denied) {
      return { shouldMerge: false, score: 0, reasons };
    }

    if (
      input.pending.completeness === 'incomplete' ||
      input.pending.completeness === 'uncertain'
    ) {
      score += 3;
      reasons.push('previous-incomplete');
    }

    if (input.gapMs >= 0 && input.gapMs <= input.shortGapMs) {
      score += 2;
      reasons.push('short-time-gap');
    }

    if (
      input.pending.preliminaryTopic === input.nextTopic &&
      input.nextTopic !== 'uncertain'
    ) {
      score += 2;
      reasons.push('same-topic');
    } else if (
      input.pending.preliminaryTopic === 'uncertain' ||
      input.nextTopic === 'uncertain'
    ) {
      score += 1;
      reasons.push('uncertain-topic-continuation');
    }

    if (startsLowercaseContinuation(input.next.text)) {
      score += 1;
      reasons.push('lowercase-continuation');
    }

    const start = firstToken(input.next.text);
    if ((CONTINUATION_STARTS as readonly string[]).includes(start)) {
      score += 2;
      reasons.push('sentence-fragment-continuation');
    }

    if (endsWithBrokenWord(input.pending.combinedText)) {
      score += 2;
      reasons.push('broken-word-continuation');
    }

    return {
      shouldMerge: score >= input.mergeThreshold,
      score,
      reasons,
    };
  }

  merge(pending: PendingUtterance, next: RawTranscriptSegment): PendingUtterance {
    const combinedText = joinTexts(pending.combinedText, next.text);
    const endMs = next.endMs ?? pending.endMs;
    const now = Date.now();

    return {
      ...pending,
      segments: [...pending.segments, next],
      combinedText,
      endMs,
      updatedAt: now,
      mergeCount: pending.mergeCount + 1,
    };
  }
}

export function combineSegmentTexts(segments: RawTranscriptSegment[]): string {
  if (segments.length === 0) return '';
  let text = segments[0]!.text.trim();
  for (let i = 1; i < segments.length; i++) {
    text = joinTexts(text, segments[i]!.text);
  }
  return text;
}

export { countWords, joinTexts };
