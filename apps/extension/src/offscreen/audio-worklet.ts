/**
 * AudioWorkletProcessor: downmix → resample → chunk → Int16 PCM.
 * Built as a standalone classic script for chrome.runtime.getURL loading.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const sampleRate: number;
declare function registerProcessor(name: string, processorCtor: unknown): void;

interface AudioWorkletProcessorImpl {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare const AudioWorkletProcessor: {
  prototype: AudioWorkletProcessorImpl;
  new (options?: AudioWorkletNodeOptions): AudioWorkletProcessorImpl;
};

class PcmCaptureProcessor extends (AudioWorkletProcessor as any) {
  private readonly targetRate: number;
  private readonly chunkSize: number;
  private buffer: Float32Array;
  private offset = 0;
  private frac = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const opts = (options?.processorOptions ?? {}) as {
      targetSampleRate?: number;
      chunkSize?: number;
    };
    this.targetRate = opts.targetSampleRate ?? 16_000;
    this.chunkSize = opts.chunkSize ?? 1_600;
    this.buffer = new Float32Array(this.chunkSize);
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel0 = input[0];
    if (!channel0 || channel0.length === 0) return true;

    const channel1 = input[1];
    const frames = channel0.length;
    const ratio = sampleRate / this.targetRate;

    let srcPos = this.frac;
    while (srcPos < frames) {
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(i0 + 1, frames - 1);
      const t = srcPos - i0;

      let s0 = channel0[i0] ?? 0;
      let s1 = channel0[i1] ?? 0;
      if (channel1) {
        s0 = (s0 + (channel1[i0] ?? 0)) * 0.5;
        s1 = (s1 + (channel1[i1] ?? 0)) * 0.5;
      }
      const sample = s0 + (s1 - s0) * t;

      this.buffer[this.offset++] = sample;
      if (this.offset >= this.chunkSize) {
        const pcm = floatTo16BitPCM(this.buffer);
        (this as unknown as AudioWorkletProcessorImpl).port.postMessage(
          { type: 'pcm', buffer: pcm.buffer },
          [pcm.buffer],
        );
        this.buffer = new Float32Array(this.chunkSize);
        this.offset = 0;
      }
      srcPos += ratio;
    }
    this.frac = srcPos - frames;
    return true;
  }
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
