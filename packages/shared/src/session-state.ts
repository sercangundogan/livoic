import type { SessionStatus } from '@live-translator/protocol';

const ALLOWED_TRANSITIONS: Record<SessionStatus, ReadonlySet<SessionStatus>> = {
  idle: new Set(['detecting', 'ready', 'error']),
  detecting: new Set(['ready', 'idle', 'error']),
  ready: new Set(['requesting-permission', 'idle', 'stopped', 'error']),
  'requesting-permission': new Set(['connecting', 'ready', 'error', 'stopped']),
  connecting: new Set(['listening', 'reconnecting', 'stopping', 'error', 'stopped']),
  listening: new Set(['reconnecting', 'paused', 'stopping', 'error', 'stopped']),
  reconnecting: new Set(['listening', 'stopping', 'error', 'stopped']),
  paused: new Set(['listening', 'stopping', 'error', 'stopped']),
  stopping: new Set(['stopped', 'error']),
  stopped: new Set(['idle', 'ready', 'detecting']),
  error: new Set(['idle', 'ready', 'stopped', 'detecting']),
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

export function transition(
  from: SessionStatus,
  to: SessionStatus,
): { ok: true; status: SessionStatus } | { ok: false; status: SessionStatus; reason: string } {
  if (canTransition(from, to)) {
    return { ok: true, status: to };
  }
  return {
    ok: false,
    status: from,
    reason: `Invalid transition: ${from} → ${to}`,
  };
}

export const STATUS_COPY: Record<SessionStatus, string> = {
  idle: 'Ready when you are',
  detecting: 'Checking this page…',
  ready: 'Twitch stream detected',
  'requesting-permission': 'Requesting access…',
  connecting: 'Starting…',
  listening: 'Listening',
  reconnecting: 'The connection was interrupted. Reconnecting…',
  paused: 'Paused',
  stopping: 'Stopping…',
  stopped: 'Stopped',
  error: 'Something went wrong',
};

export function isActiveSession(status: SessionStatus): boolean {
  return (
    status === 'requesting-permission' ||
    status === 'connecting' ||
    status === 'listening' ||
    status === 'reconnecting' ||
    status === 'paused' ||
    status === 'stopping'
  );
}
