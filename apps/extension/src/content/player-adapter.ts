export interface PlayerAdapter {
  isSupportedPage(): boolean;
  findPlayerContainer(): HTMLElement | null;
  findVideoElement(): HTMLVideoElement | null;
  observePlayerChanges(callback: () => void): () => void;
  getPageMetadata(): {
    platform: string;
    channel?: string;
    title?: string;
  };
}
