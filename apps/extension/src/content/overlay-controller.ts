import type { SessionStatus, SubtitleBackground, SubtitleMode, SubtitlePosition, SubtitleSize } from '@live-translator/protocol';
import { formatSubtitleText } from '@live-translator/shared';
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

const SIZE_MAP: Record<SubtitleSize, string> = {
  small: 'clamp(16px, 2.2vw, 22px)',
  medium: 'clamp(20px, 2.8vw, 28px)',
  large: 'clamp(24px, 3.4vw, 34px)',
};

const POSITION_MAP: Record<SubtitlePosition, string> = {
  low: '8%',
  medium: '16%',
};

export class OverlayController {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unobservePlayer?: () => void;
  private staleTimer?: ReturnType<typeof setTimeout>;
  private lastFinalSegmentId: string | null = null;
  private settings: OverlaySettings = {
    subtitleMode: 'translation',
    subtitleSize: 'medium',
    subtitleBackground: 'off',
    subtitlePosition: 'low',
  };
  private status: SessionStatus = 'idle';

  constructor(private readonly adapter: PlayerAdapter) {}

  mount(): void {
    this.ensureOverlay();
    this.unobservePlayer = this.adapter.observePlayerChanges(() => this.ensureOverlay());
  }

  destroy(): void {
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
    const root = this.shadow?.getElementById('subtitle-root');
    if (!root) return;

    if (payload.partial && !payload.translatedText) {
      // Subtle partial source preview
      root.innerHTML = this.renderLines(
        formatSubtitleText(payload.sourceText ?? '').lines,
        true,
      );
      this.bumpStaleTimer();
      return;
    }

    if (payload.segmentId === this.lastFinalSegmentId && !payload.partial) {
      return;
    }

    if (!payload.partial) {
      this.lastFinalSegmentId = payload.segmentId;
    }

    const mode = this.settings.subtitleMode;
    let html = '';

    if (mode === 'source' && payload.sourceText) {
      html = this.renderLines(formatSubtitleText(payload.sourceText).lines, false);
    } else if (mode === 'bilingual') {
      const source = payload.sourceText
        ? `<div class="source">${this.renderLines(formatSubtitleText(payload.sourceText, { maxLines: 1 }).lines, true)}</div>`
        : '';
      const translation = payload.translatedText
        ? `<div class="translation">${this.renderLines(formatSubtitleText(payload.translatedText).lines, false)}</div>`
        : '';
      html = `${source}${translation}`;
    } else if (payload.translatedText) {
      html = this.renderLines(formatSubtitleText(payload.translatedText).lines, false);
    }

    if (html) {
      root.innerHTML = html;
      root.style.opacity = '1';
      this.bumpStaleTimer(formatSubtitleText(payload.translatedText ?? payload.sourceText ?? '').displayMs);
    }
  }

  clear(): void {
    const root = this.shadow?.getElementById('subtitle-root');
    if (root) {
      root.style.opacity = '0';
      setTimeout(() => {
        if (root) root.innerHTML = '';
      }, 180);
    }
    this.lastFinalSegmentId = null;
    if (this.staleTimer) clearTimeout(this.staleTimer);
  }

  private ensureOverlay(): void {
    const container = this.adapter.findPlayerContainer();
    if (!container) return;

    if (this.host && container.contains(this.host)) {
      this.syncGeometry(container);
      return;
    }

    // Remove any leftover hosts (Twitch remount / SPA navigation)
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
          transition: opacity 180ms ease-out;
          text-align: center;
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
        .line.partial { opacity: 0.55; font-weight: 500; }
        .source .line { opacity: 0.7; font-size: calc(var(--lt-sub-size, 24px) * 0.78); font-weight: 500; }
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
          transition: opacity 180ms ease-out;
        }
        .wrap:hover + #status-pill,
        #status-pill:hover,
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
    // Keep host covering the player; fullscreen attaches to video element parent
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
    return lines.map((line) => `<p class="line${partial ? ' partial' : ''}">${escapeHtml(line)}</p>`).join('');
  }

  private bumpStaleTimer(displayMs = 5000): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      const root = this.shadow?.getElementById('subtitle-root');
      if (root) root.style.opacity = '0';
    }, displayMs);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
