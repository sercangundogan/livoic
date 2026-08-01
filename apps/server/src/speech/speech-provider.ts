export type TranscriptWord = {
  word: string;
  confidence?: number;
  startMs?: number;
  endMs?: number;
};

export type TranscriptEvent = {
  segmentId: string;
  text: string;
  isFinal: boolean;
  language?: string;
  startMs?: number;
  endMs?: number;
  /** Provider confidence in [0, 1] when available (e.g. Deepgram alternatives[0].confidence). */
  confidence?: number;
  /** Word-level metadata when the streaming adapter provides it. */
  words?: TranscriptWord[];
};

export type SpeechSessionOptions = {
  sessionId: string;
  sourceLanguage: string;
  sampleRate: number;
  channels: number;
};

export interface SpeechToTextProvider {
  connect(options: SpeechSessionOptions): Promise<void>;
  sendAudio(chunk: Buffer): void;
  onPartial(callback: (event: TranscriptEvent) => void): void;
  onFinal(callback: (event: TranscriptEvent) => void): void;
  onError(callback: (error: Error) => void): void;
  close(): Promise<void>;
}
