import type { TopicRoutingRuntimeConfig } from './config.js';
import type { ProcessedTranscriptSegment, TopicContextHistory } from './types.js';

export class TopicContextHistoryStore {
  private readonly history: TopicContextHistory = {
    gameSegments: [],
    generalSegments: [],
    recentMixedSegments: [],
  };

  constructor(private readonly config: TopicRoutingRuntimeConfig) {}

  push(segment: ProcessedTranscriptSegment): void {
    if (segment.topic === 'game') {
      this.history.gameSegments.push(segment);
      this.trim(this.history.gameSegments, this.config.contextGameSegments);
    } else if (segment.topic === 'general') {
      this.history.generalSegments.push(segment);
      this.trim(this.history.generalSegments, this.config.contextGeneralSegments);
    }

    this.history.recentMixedSegments.push(segment);
    this.trim(this.history.recentMixedSegments, this.config.contextMixedSegments);
  }

  getGameTexts(): string[] {
    return this.history.gameSegments.map((s) => s.text);
  }

  getGeneralTexts(): string[] {
    return this.history.generalSegments.map((s) => s.text);
  }

  getMixedTexts(): string[] {
    return this.history.recentMixedSegments.map((s) => s.text);
  }

  getHistory(): TopicContextHistory {
    return {
      gameSegments: [...this.history.gameSegments],
      generalSegments: [...this.history.generalSegments],
      recentMixedSegments: [...this.history.recentMixedSegments],
    };
  }

  clear(): void {
    this.history.gameSegments = [];
    this.history.generalSegments = [];
    this.history.recentMixedSegments = [];
  }

  clearGame(): void {
    this.history.gameSegments = [];
  }

  private trim(list: ProcessedTranscriptSegment[], max: number): void {
    while (list.length > max) {
      list.shift();
    }
  }
}
