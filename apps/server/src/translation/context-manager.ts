import { SUBTITLE } from '@live-translator/shared';

export class ContextManager {
  private readonly segments: string[] = [];

  push(finalText: string): void {
    this.segments.push(finalText);
    while (this.segments.length > SUBTITLE.contextHistorySize) {
      this.segments.shift();
    }
  }

  getPrevious(): string[] {
    return [...this.segments];
  }

  clear(): void {
    this.segments.length = 0;
  }
}
