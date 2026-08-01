/**
 * Bounded PCM s16le mono ring buffer keyed by stream timeline milliseconds.
 * Duration: bytes / (sampleRate * 2) * 1000
 *
 * Timeline is absolute from the first byte pushed in the session. Dropping
 * oldest data advances the buffer start so extract(startMs, endMs) still
 * addresses the original stream clock.
 */
export class AudioRingBuffer {
  private chunks: Buffer[] = [];
  private totalBytes = 0;
  /** Absolute byte offset of the first sample currently held in the buffer. */
  private bufferStartAbsoluteByte = 0;
  private readonly maxBytes: number;
  private readonly bytesPerMs: number;

  constructor(
    private readonly sampleRate: number,
    maxSeconds: number,
  ) {
    this.maxBytes = Math.max(1, Math.floor(sampleRate * 2 * maxSeconds));
    this.bytesPerMs = (sampleRate * 2) / 1000;
  }

  get durationMs(): number {
    if (this.bytesPerMs <= 0) return 0;
    return this.totalBytes / this.bytesPerMs;
  }

  push(chunk: Buffer): void {
    if (chunk.length === 0) return;
    const copy = Buffer.from(chunk);
    this.chunks.push(copy);
    this.totalBytes += copy.length;
    this.trimToCapacity();
  }

  /**
   * Extract PCM for [startMs, endMs] on the absolute stream timeline,
   * with optional padding on both sides.
   */
  extract(startMs: number, endMs: number, padMs = 0): Buffer {
    if (this.totalBytes === 0 || endMs <= startMs) return Buffer.alloc(0);

    const paddedStartMs = Math.max(0, startMs - padMs);
    const paddedEndMs = Math.max(paddedStartMs, endMs + padMs);

    let absStart = Math.floor(paddedStartMs * this.bytesPerMs);
    let absEnd = Math.ceil(paddedEndMs * this.bytesPerMs);
    // Align to 2-byte sample boundaries
    absStart -= absStart % 2;
    if (absEnd % 2 !== 0) absEnd += 1;

    const bufferEndAbs = this.bufferStartAbsoluteByte + this.totalBytes;
    const clampedAbsStart = Math.max(this.bufferStartAbsoluteByte, Math.min(absStart, bufferEndAbs));
    const clampedAbsEnd = Math.max(clampedAbsStart, Math.min(absEnd, bufferEndAbs));
    if (clampedAbsEnd <= clampedAbsStart) return Buffer.alloc(0);

    const relStart = clampedAbsStart - this.bufferStartAbsoluteByte;
    const relEnd = clampedAbsEnd - this.bufferStartAbsoluteByte;

    const concat = Buffer.concat(this.chunks);
    return Buffer.from(concat.subarray(relStart, relEnd));
  }

  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
    this.bufferStartAbsoluteByte = 0;
  }

  private trimToCapacity(): void {
    while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
      const oldest = this.chunks[0]!;
      const overflow = this.totalBytes - this.maxBytes;
      if (oldest.length <= overflow) {
        this.chunks.shift();
        this.totalBytes -= oldest.length;
        this.bufferStartAbsoluteByte += oldest.length;
      } else {
        let drop = overflow;
        if (drop % 2 === 1) drop += 1;
        drop = Math.min(drop, oldest.length);
        if (drop <= 0) break;
        // Keep even length remainder when possible
        if ((oldest.length - drop) % 2 === 1 && drop + 1 <= oldest.length) drop += 1;
        this.chunks[0] = oldest.subarray(drop);
        this.totalBytes -= drop;
        this.bufferStartAbsoluteByte += drop;
      }
    }
  }
}
