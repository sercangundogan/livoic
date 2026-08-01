import { create } from 'zustand';
import type { SessionStatus } from '@live-translator/protocol';

type OverlayState = {
  status: SessionStatus;
  lines: string[];
  sourceLines: string[];
  partial: boolean;
  setSubtitle: (payload: {
    lines: string[];
    sourceLines?: string[];
    partial?: boolean;
  }) => void;
  setStatus: (status: SessionStatus) => void;
  clear: () => void;
};

export const useOverlayStore = create<OverlayState>((set) => ({
  status: 'idle',
  lines: [],
  sourceLines: [],
  partial: false,
  setSubtitle: ({ lines, sourceLines = [], partial = false }) =>
    set({ lines, sourceLines, partial }),
  setStatus: (status) => set({ status }),
  clear: () => set({ lines: [], sourceLines: [], partial: false }),
}));
