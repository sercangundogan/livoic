import type { ClientEvent, LanguageCode, ServerEvent } from '@live-translator/protocol';
import { ServerEventSchema } from '@live-translator/protocol';
import { AUDIO, getReconnectDelay, SequenceTracker, shouldRetry } from '@live-translator/shared';

export type RealtimeClientCallbacks = {
  onEvent: (event: ServerEvent) => void;
  onStatus: (status: 'connecting' | 'listening' | 'reconnecting' | 'error', message?: string) => void;
};

type StartOptions = {
  apiBase: string;
  sessionId: string;
  targetLanguage: LanguageCode;
  platform?: 'twitch';
};

/**
 * WebSocket client with heartbeats, reconnect, and audio ring buffer.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private options: StartOptions | null = null;
  private readonly tracker = new SequenceTracker();
  private readonly audioRing: ArrayBuffer[] = [];
  private attempt = 0;
  private closed = false;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private token: string | null = null;
  private wsUrl: string | null = null;
  private started = false;

  constructor(private readonly callbacks: RealtimeClientCallbacks) {}

  async start(options: StartOptions): Promise<void> {
    this.options = options;
    this.closed = false;
    this.attempt = 0;
    this.tracker.reset();
    await this.connect();
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.closed) return;
    if (this.ws?.readyState === WebSocket.OPEN && this.started) {
      this.ws.send(chunk);
      return;
    }
    this.audioRing.push(chunk);
    while (this.audioRing.length > AUDIO.maxBufferedChunks) {
      this.audioRing.shift();
    }
  }

  async stop(): Promise<void> {
    this.closed = true;
    this.clearTimers();
    if (this.ws && this.options && this.started) {
      const stopEvent: ClientEvent = {
        type: 'session.stop',
        sessionId: this.options.sessionId,
      };
      try {
        this.ws.send(JSON.stringify(stopEvent));
      } catch {
        // ignore
      }
    }
    this.ws?.close();
    this.ws = null;
    this.audioRing.length = 0;
  }

  private async connect(): Promise<void> {
    if (!this.options) return;
    this.callbacks.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    try {
      if (!this.token || !this.wsUrl) {
        const tokenRes = await fetch(`${this.options.apiBase}/api/realtime/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ platform: 'twitch' }),
        });
        if (!tokenRes.ok) throw new Error('Auth failed');
        const body = (await tokenRes.json()) as { token: string; wsUrl: string };
        this.token = body.token;
        this.wsUrl = body.wsUrl;
      }

      const url = `${this.wsUrl}?token=${encodeURIComponent(this.token)}`;
      await this.openSocket(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      await this.scheduleReconnect(message);
    }
  }

  private openSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        if (!this.options) return;
        const startEvent: ClientEvent = {
          type: 'session.start',
          sessionId: this.options.sessionId,
          sourceLanguage: 'auto',
          targetLanguage: this.options.targetLanguage,
          encoding: 'pcm_s16le',
          sampleRate: 16000,
          channels: 1,
          platform: this.options.platform ?? 'twitch',
        };
        ws.send(JSON.stringify(startEvent));
        this.started = true;
        this.attempt = 0;
        this.flushAudio();
        this.startHeartbeat();
        this.callbacks.onStatus('listening');
        resolve();
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const parsed = ServerEventSchema.safeParse(JSON.parse(event.data));
          if (!parsed.success) return;
          if (!this.tracker.accept(parsed.data.sequence) && parsed.data.type !== 'pong') {
            return;
          }
          this.callbacks.onEvent(parsed.data);
        } catch {
          // ignore malformed
        }
      };

      ws.onerror = () => {
        reject(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        this.clearHeartbeat();
        if (!this.closed) {
          void this.scheduleReconnect('Connection closed');
        }
      };
    });
  }

  private flushAudio(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.audioRing.length > 0) {
      const chunk = this.audioRing.shift();
      if (chunk) this.ws.send(chunk);
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.options) return;
      const ping: ClientEvent = {
        type: 'ping',
        sessionId: this.options.sessionId,
        clientTime: Date.now(),
      };
      this.ws.send(JSON.stringify(ping));
    }, 15_000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private async scheduleReconnect(reason: string): Promise<void> {
    if (this.closed) return;
    if (!shouldRetry(this.attempt)) {
      this.callbacks.onStatus('error', "We couldn't restore the connection.");
      return;
    }
    const delay = getReconnectDelay(this.attempt);
    this.attempt += 1;
    this.callbacks.onStatus('reconnecting', reason);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }
}
