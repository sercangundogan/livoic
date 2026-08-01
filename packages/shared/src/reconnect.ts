import { RECONNECT } from './constants.js';

export function getReconnectDelay(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), RECONNECT.delaysMs.length - 1);
  return RECONNECT.delaysMs[index] ?? RECONNECT.delaysMs[RECONNECT.delaysMs.length - 1]!;
}

export function shouldRetry(attempt: number): boolean {
  return attempt < RECONNECT.maxAttempts;
}

export class SequenceTracker {
  private lastSequence = -1;
  private readonly seen = new Set<number>();
  private readonly maxSeen: number;

  constructor(maxSeen = 256) {
    this.maxSeen = maxSeen;
  }

  /** Returns true if the event should be processed (not a duplicate / outdated). */
  accept(sequence: number): boolean {
    if (this.seen.has(sequence)) {
      return false;
    }
    if (sequence < this.lastSequence - 32) {
      // Far behind — ignore stale events after reconnect storm
      return false;
    }
    this.seen.add(sequence);
    this.lastSequence = Math.max(this.lastSequence, sequence);
    if (this.seen.size > this.maxSeen) {
      const sorted = [...this.seen].sort((a, b) => a - b);
      const toRemove = sorted.slice(0, sorted.length - this.maxSeen);
      for (const s of toRemove) this.seen.delete(s);
    }
    return true;
  }

  getLastSequence(): number {
    return this.lastSequence;
  }

  reset(): void {
    this.lastSequence = -1;
    this.seen.clear();
  }
}
