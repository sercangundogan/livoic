import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { loadConfig } from './config/index.js';
import { buildApp } from './app.js';
import { issueRealtimeToken, verifyRealtimeToken } from './auth/realtime-token.js';
import { MockTranslationProvider } from './translation/mock-translation-provider.js';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

describe('auth tokens', () => {
  it('issues and verifies tokens', () => {
    const config = loadConfig({
      ...process.env,
      REALTIME_TOKEN_SECRET: 'test-secret-value',
      DEV_AUTH_MODE: 'false',
    });
    const issued = issueRealtimeToken(config, 'user-1');
    const verified = verifyRealtimeToken(issued.token, config);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.payload.sub).toBe('user-1');
  });

  it('rejects bad tokens', () => {
    const config = loadConfig({
      ...process.env,
      REALTIME_TOKEN_SECRET: 'test-secret-value',
      DEV_AUTH_MODE: 'false',
    });
    const verified = verifyRealtimeToken('not.a.token', config);
    expect(verified.ok).toBe(false);
  });
});

describe('mock translation', () => {
  it('translates known gaming phrases to Turkish', async () => {
    const provider = new MockTranslationProvider();
    const result = await provider.translate({
      text: 'Bro, this build is actually cracked.',
      targetLanguage: 'tr',
    });
    expect(result.translatedText).toContain('build');
    expect(result.translatedText).not.toContain('çatlamış');
  });
});

describe('http + websocket integration', () => {
  const config = loadConfig({
    ...process.env,
    PORT: '0',
    REALTIME_TOKEN_SECRET: 'test-secret-value',
    DEV_AUTH_MODE: 'true',
    SPEECH_PROVIDER: 'mock',
    TRANSLATION_PROVIDER: 'mock',
  });

  let baseUrl = '';
  let wsBase = '';
  let closeServer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const { app } = await buildApp(config);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    baseUrl = `http://127.0.0.1:${address.port}`;
    wsBase = `ws://127.0.0.1:${address.port}`;
    closeServer = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    await closeServer?.();
  });

  it('returns health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('issues realtime tokens', async () => {
    const res = await fetch(`${baseUrl}/api/realtime/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'twitch' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; wsUrl: string };
    expect(body.token.length).toBeGreaterThan(10);
    expect(body.wsUrl).toContain('/ws/realtime');
  });

  it('rejects websocket without token', async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${wsBase}/ws/realtime`);
      ws.on('close', (code) => {
        expect(code).toBe(4401);
        resolve();
      });
      ws.on('error', () => resolve());
      setTimeout(() => reject(new Error('timeout')), 3000);
    });
  });

  it('runs a mock session end-to-end', async () => {
    const tokenRes = await fetch(`${baseUrl}/api/realtime/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const { token } = (await tokenRes.json()) as { token: string };
    const sessionId = randomUUID();

    const events: Array<{ type: string }> = await new Promise((resolve, reject) => {
      const collected: Array<{ type: string }> = [];
      const ws = new WebSocket(`${wsBase}/ws/realtime?token=${token}`);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('e2e timeout'));
      }, 12_000);

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'session.start',
            sessionId,
            sourceLanguage: 'auto',
            targetLanguage: 'tr',
            encoding: 'pcm_s16le',
            sampleRate: 16000,
            channels: 1,
            platform: 'twitch',
          }),
        );

        // Send enough silent PCM to unlock mock emissions
        const chunk = Buffer.alloc(3200);
        const interval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
        }, 100);

        const done = () => {
          clearInterval(interval);
          clearTimeout(timeout);
          ws.close();
          resolve(collected);
        };

        ws.on('message', (data) => {
          const event = JSON.parse(data.toString()) as { type: string };
          collected.push(event);
          if (event.type === 'translation.final') {
            ws.send(JSON.stringify({ type: 'session.stop', sessionId }));
            setTimeout(done, 200);
          }
        });
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const types = events.map((e) => e.type);
    expect(types).toContain('session.ready');
    expect(types).toContain('transcript.final');
    expect(types).toContain('translation.final');
  }, 15_000);
});
