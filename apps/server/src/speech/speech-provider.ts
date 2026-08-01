export type TranscriptEvent = {
  segmentId: string;
  text: string;
  isFinal: boolean;
  language?: string;
  startMs?: number;
  endMs?: number;
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
