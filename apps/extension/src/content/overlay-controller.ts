import type {
  SessionStatus,
  SubtitleBackground,
  SubtitleMode,
  SubtitlePosition,
  SubtitleSize,
} from '@live-translator/protocol';
import { formatSubtitleText, SUBTITLE } from '@live-translator/shared';
import type { PlayerAdapter } from './player-adapter.js';

type SubtitlePayload = {
  segmentId: string;
  sourceText?: string;
  translatedText?: string;
  partial?: boolean;
};

type OverlaySettings = {
  subtitleMode: SubtitleMode;
  subtitleSize: SubtitleSize;
  subtitleBackground: SubtitleBackground;
  subtitlePosition: SubtitlePosition;
};

type QueuedCue = {
  segmentId: string;
  html: string;
  displayMs: number;
};

const SIZE_MAP: Record<SubtitleSize, string> = {
  small: 'clamp(16px, 2.2vw, 22px)',
  medium: 'clamp(20px, 2.8vw, 28px)',
  large: 'clamp(24px, 3.4vw, 34px)',
};

const POSITION_MAP: Record<SubtitlePosition, string> = {
  low: '8%',
  medium: '16%',
};

const FADE_MS = 160;
const MAX_QUEUE = 4;
/** When behind, still show each cue briefly so the stream feels live. */
const CATCH_UP_DISPLAY_MS = 1_400;

export class OverlayController {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unobservePlayer?: () => void;
  private settings: OverlaySettings = {
    subtitleMode: 'translation',
    subtitleSize: 'medium',
    subtitleBackground: 'off',
    subtitlePosition: 'low',
  };
  private status: SessionStatus = 'idle';

  private queue: QueuedCue[] = [];
  private playing = false;
  private currentSegmentId: string | null = null;
  private advanceTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private playGeneration = 0;

  constructor(private readonly adapter: PlayerAdapter) {}

  mount(): void {
    this.ensureOverlay();
    this.unobservePlayer = this.adapter.observePlayerChanges(() => this.ensureOverlay());
  }

  destroy(): void {
    this.playGeneration += 1;
    this.clearTimers();
    this.queue = [];
    this.playing = false;
    this.unobservePlayer?.();
    this.resizeObserver?.disconnect();
    this.host?.remove();
    this.host = null;
    this.shadow = null;
  }

  updateSettings(partial: Partial<OverlaySettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.applySettingsStyles();
  }

  setStatus(status: SessionStatus, message?: string): void {
    this.status = status;
    const pill = this.shadow?.getElementById('status-pill');
    if (!pill) return;

    const show =
      status === 'listening' ||
      status === 'reconnecting' ||
      status === 'connecting' ||
      status === 'paused';

    pill.style.opacity = show ? '1' : '0';
    pill.style.pointerEvents = show ? 'auto' : 'none';

    const label =
      status === 'listening'
        ? 'Live translation'
        : status === 'reconnecting'
          ? 'Reconnecting…'
          : status === 'connecting'
            ? 'Starting…'
            : message || status;

    pill.textContent = status === 'listening' ? `● ${label}` : label;
  }

  showSubtitle(payload: SubtitlePayload): void {
    this.ensureOverlay();

    // Never paint raw source / partial transcripts in translation-first UX.
    // Partials are source-language drafts and cause the "English flash" problem.
    if (payload.partial && !payload.translatedText) {
      return;
    }

    const mode = this.settings.subtitleMode;
    const cue = this.buildCue(payload, mode);
    if (!cue) return;

    if (cue.segmentId === this.currentSegmentId) {
      // Same segment finalized/updated while on screen — refresh in place.
      void this.renderCue(cue, { immediate: true });
      return;
    }

    const existingIndex = this.queue.findIndex((item) => item.segmentId === cue.segmentId);
    if (existingIndex >= 0) {
      this.queue[existingIndex] = cue;
      return;
    }

    this.queue.push(cue);
    while (this.queue.length > MAX_QUEUE) {
      this.queue.shift();
    }

    if (!this.playing) {
      void this.drainQueue();
    }
  }

  clear(): void {
    this.playGeneration += 1;
    this.clearTimers();
    this.queue = [];
    this.playing = false;
    this.currentSegmentId = null;
    const root = this.shadow?.getElementById('subtitle-root');
    if (root) {
      root.style.opacity = '0';
      window.setTimeout(() => {
        if (root) root.innerHTML = '';
      }, FADE_MS);
    }
  }

  private buildCue(payload: SubtitlePayload, mode: SubtitleMode): QueuedCue | null {
    if (mode === 'source') {
      if (!payload.sourceText?.trim()) return null;
      const formatted = formatSubtitleText(payload.sourceText);
      return {
        segmentId: payload.segmentId,
        html: this.renderLines(formatted.lines, false),
        displayMs: formatted.displayMs,
      };
    }

    if (mode === 'bilingual') {
      if (!payload.translatedText?.trim()) return null;
      const translation = formatSubtitleText(payload.translatedText);
      const source = payload.sourceText
        ? `<div class="source">${this.renderLines(formatSubtitleText(payload.sourceText, { maxLines: 1 }).lines, false)}</div>`
        : '';
      const translated = `<div class="translation">${this.renderLines(translation.lines, false)}</div>`;
      return {
        segmentId: payload.segmentId,
        html: `${source}${translated}`,
        displayMs: translation.displayMs,
      };
    }

    // translation-only (default): never use source text
    if (!payload.translatedText?.trim()) return null;
    const formatted = formatSubtitleText(payload.translatedText);
    return {
      segmentId: payload.segmentId,
      html: this.renderLines(formatted.lines, false),
      displayMs: formatted.displayMs,
    };
  }

  private async drainQueue(): Promise<void> {
    const generation = this.playGeneration;
    this.playing = true;

    while (generation === this.playGeneration) {
      const next = this.queue.shift();
      if (!next) break;

      const backlog = this.queue.length;
      const displayMs =
        backlog >= 2
          ? Math.max(SUBTITLE.minDisplayMs, Math.min(next.displayMs, CATCH_UP_DISPLAY_MS))
          : Math.max(SUBTITLE.minDisplayMs, Math.min(next.displayMs, SUBTITLE.maxDisplayMs));

      await this.renderCue(next, { immediate: false });
      if (generation !== this.playGeneration) return;

      await this.wait(displayMs);
      if (generation !== this.playGeneration) return;
    }

    this.playing = false;
    this.scheduleIdleFade();
  }

  private async renderCue(
    cue: QueuedCue,
    options: { immediate: boolean },
  ): Promise<void> {
    const root = this.shadow?.getElementById('subtitle-root');
    if (!root) return;

    this.clearIdleTimer();
    this.currentSegmentId = cue.segmentId;

    if (options.immediate || !root.innerHTML.trim()) {
      root.innerHTML = cue.html;
      root.style.opacity = '1';
      return;
    }

    root.style.opacity = '0';
    await this.wait(FADE_MS);
    root.innerHTML = cue.html;
    // Force style flush so the fade-in always runs
    void root.offsetWidth;
    root.style.opacity = '1';
    await this.wait(FADE_MS);
  }

  private scheduleIdleFade(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      const root = this.shadow?.getElementById('subtitle-root');
      if (root && this.queue.length === 0 && !this.playing) {
        root.style.opacity = '0';
      }
    }, SUBTITLE.staleTimeoutMs);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.advanceTimer = setTimeout(resolve, ms);
    });
  }

  private clearTimers(): void {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = undefined;
    this.clearIdleTimer();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private ensureOverlay(): void {
    const container = this.adapter.findPlayerContainer();
    if (!container) return;

    if (this.host && container.contains(this.host)) {
      this.syncGeometry(container);
      return;
    }

    document.querySelectorAll('[data-live-translator-overlay]').forEach((el) => el.remove());

    const host = document.createElement('div');
    host.setAttribute('data-live-translator-overlay', 'true');
    host.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden;';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: Inter, system-ui, sans-serif; }
        .wrap {
          position: absolute;
          left: 50%;
          bottom: var(--lt-sub-bottom, 8%);
          transform: translateX(-50%);
          width: min(90%, 820px);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          pointer-events: none;
        }
        #subtitle-root {
          transition: opacity ${FADE_MS}ms ease-out;
          text-align: center;
          min-height: 1.35em;
        }
        .line {
          color: #fff;
          font-weight: 600;
          line-height: 1.35;
          font-size: var(--lt-sub-size, clamp(20px, 2.8vw, 28px));
          text-shadow:
            0 2px 4px rgba(0,0,0,0.95),
            0 0 12px rgba(0,0,0,0.75);
          margin: 0;
        }
        .source .line {
          opacity: 0.7;
          font-size: calc(var(--lt-sub-size, 24px) * 0.78);
          font-weight: 500;
        }
        .translation .line { font-weight: 650; }
        .bg-on #subtitle-root {
          background: rgba(0,0,0,0.45);
          padding: 8px 14px;
          border-radius: 10px;
        }
        #status-pill {
          position: absolute;
          left: 12px;
          bottom: 12px;
          opacity: 0;
          pointer-events: none;
          background: rgba(20,22,27,0.82);
          color: #f7f7f8;
          font-size: 12px;
          font-weight: 500;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          transition: opacity ${FADE_MS}ms ease-out;
        }
        .controls-hotzone:hover #status-pill {
          opacity: 1;
          pointer-events: auto;
        }
        @media (prefers-reduced-motion: reduce) {
          #subtitle-root, #status-pill { transition: none; }
        }
      </style>
      <div class="controls-hotzone" style="position:absolute;inset:0;">
        <div class="wrap" id="wrap">
          <div id="subtitle-root" aria-live="off"></div>
        </div>
        <div id="status-pill" role="status">● Live translation</div>
      </div>
    `;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(host);
    this.host = host;
    this.shadow = shadow;
    this.applySettingsStyles();
    this.syncGeometry(container);
    this.setStatus(this.status);

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.syncGeometry(container));
    this.resizeObserver.observe(container);
  }

  private syncGeometry(container: HTMLElement): void {
    if (!this.host) return;
    const fsElement = document.fullscreenElement;
    if (fsElement instanceof HTMLElement && fsElement !== container && !fsElement.contains(this.host)) {
      if (getComputedStyle(fsElement).position === 'static') {
        fsElement.style.position = 'relative';
      }
      fsElement.appendChild(this.host);
    }
  }

  private applySettingsStyles(): void {
    const wrap = this.shadow?.getElementById('wrap');
    const hotzone = this.shadow?.querySelector('.controls-hotzone');
    if (!wrap) return;
    wrap.style.setProperty('--lt-sub-size', SIZE_MAP[this.settings.subtitleSize]);
    wrap.style.setProperty('--lt-sub-bottom', POSITION_MAP[this.settings.subtitlePosition]);
    if (hotzone) {
      hotzone.classList.toggle('bg-on', this.settings.subtitleBackground === 'subtle');
    }
  }

  private renderLines(lines: string[], partial: boolean): string {
    return lines
      .map((line) => `<p class="line${partial ? ' partial' : ''}">${escapeHtml(line)}</p>`)
      .join('');
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
