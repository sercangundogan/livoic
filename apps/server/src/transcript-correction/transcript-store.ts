import type { StoredTranscriptSegment } from './types.js';

const MAX_SEGMENTS = 100;

export class TranscriptStore {
  private readonly segments = new Map<string, StoredTranscriptSegment>();
  private readonly order: string[] = [];

  remember(segment: StoredTranscriptSegment): void {
    if (this.segments.has(segment.segmentId)) {
      this.segments.set(segment.segmentId, segment);
      return;
    }
    this.segments.set(segment.segmentId, segment);
    this.order.push(segment.segmentId);
    while (this.order.length > MAX_SEGMENTS) {
      const oldest = this.order.shift();
      if (oldest) this.segments.delete(oldest);
    }
  }

  get(segmentId: string): StoredTranscriptSegment | undefined {
    return this.segments.get(segmentId);
  }

  clear(): void {
    this.segments.clear();
    this.order.length = 0;
  }

  size(): number {
    return this.segments.size;
  }
}
