import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { RealtimeTokenPayload } from '@live-translator/protocol';
import type { AppConfig } from '../config/index.js';

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function decode<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function issueRealtimeToken(
  config: AppConfig,
  userId = `dev-${randomUUID().slice(0, 8)}`,
): { token: string; expiresAt: number; userId: string } {
  const now = Math.floor(Date.now() / 1000);
  const payload: RealtimeTokenPayload = {
    sub: userId,
    scope: 'realtime',
    iat: now,
    exp: now + config.REALTIME_TOKEN_TTL_SECONDS,
  };
  const payloadB64 = encode(payload);
  const signature = sign(payloadB64, config.REALTIME_TOKEN_SECRET);
  return {
    token: `${payloadB64}.${signature}`,
    expiresAt: payload.exp * 1000,
    userId,
  };
}

export function verifyRealtimeToken(
  token: string,
  config: AppConfig,
): { ok: true; payload: RealtimeTokenPayload } | { ok: false; reason: string } {
  if (config.DEV_AUTH_MODE && token === 'dev-token') {
    const now = Math.floor(Date.now() / 1000);
    return {
      ok: true,
      payload: {
        sub: 'dev-user',
        scope: 'realtime',
        iat: now,
        exp: now + 3600,
      },
    };
  }

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return { ok: false, reason: 'Malformed token' };
  }

  const expected = sign(payloadB64, config.REALTIME_TOKEN_SECRET);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Invalid signature' };
  }

  try {
    const payload = decode<RealtimeTokenPayload>(payloadB64);
    if (payload.scope !== 'realtime') {
      return { ok: false, reason: 'Invalid scope' };
    }
    if (payload.exp * 1000 < Date.now()) {
      return { ok: false, reason: 'Token expired' };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'Invalid payload' };
  }
}
