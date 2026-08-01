/**
 * Pure audio conversion helpers (usable in Node tests and AudioWorklet).
 */

export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function downmixStereoToMono(input: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return input;
  const frames = Math.floor(input.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += input[i * channels + c] ?? 0;
    }
    mono[i] = sum / channels;
  }
  return mono;
}

/** Linear resampling from sourceRate to targetRate. */
export function resampleLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate || input.length === 0) {
    return input;
  }
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const left = Math.floor(srcIndex);
    const right = Math.min(left + 1, input.length - 1);
    const frac = srcIndex - left;
    const a = input[left] ?? 0;
    const b = input[right] ?? 0;
    output[i] = a + (b - a) * frac;
  }
  return output;
}

export class ChunkAccumulator {
  private buffer: Float32Array;
  private offset = 0;
  private readonly chunkSize: number;

  constructor(chunkSize: number) {
    this.chunkSize = chunkSize;
    this.buffer = new Float32Array(chunkSize);
  }

  push(samples: Float32Array): Float32Array[] {
    const chunks: Float32Array[] = [];
    let read = 0;
    while (read < samples.length) {
      const space = this.chunkSize - this.offset;
      const take = Math.min(space, samples.length - read);
      this.buffer.set(samples.subarray(read, read + take), this.offset);
      this.offset += take;
      read += take;
      if (this.offset === this.chunkSize) {
        chunks.push(this.buffer.slice());
        this.offset = 0;
      }
    }
    return chunks;
  }

  reset(): void {
    this.offset = 0;
  }
}
