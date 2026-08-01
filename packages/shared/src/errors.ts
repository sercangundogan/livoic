import type { AppErrorCode } from '@live-translator/protocol';

export type AppError = {
  code: AppErrorCode;
  message: string;
  detail?: string;
  recoverable: boolean;
};

export const ERROR_COPY: Record<
  AppErrorCode,
  { message: string; detail?: string; recoverable: boolean }
> = {
  UNSUPPORTED_PAGE: {
    message: 'Open a Twitch stream to use live translation.',
    recoverable: false,
  },
  PLAYER_NOT_FOUND: {
    message: 'The video player is not ready yet.',
    detail: 'Wait a moment for the stream to load, then try again.',
    recoverable: true,
  },
  CAPTURE_PERMISSION_DENIED: {
    message: "We couldn't access this tab's audio.",
    detail: 'Reload the Twitch page and try again.',
    recoverable: true,
  },
  AUDIO_CAPTURE_FAILED: {
    message: "We couldn't capture audio from this tab.",
    detail: 'Your stream will continue playing normally.',
    recoverable: true,
  },
  BACKEND_UNAVAILABLE: {
    message: 'Live translation is temporarily unavailable.',
    detail: 'Your stream will continue playing normally.',
    recoverable: true,
  },
  AUTH_FAILED: {
    message: "We couldn't authorize this session.",
    detail: 'Try again in a moment.',
    recoverable: true,
  },
  PROVIDER_UNAVAILABLE: {
    message: 'Live translation is temporarily unavailable.',
    detail: 'Your stream will continue playing normally.',
    recoverable: true,
  },
  RATE_LIMITED: {
    message: "You've reached today's translation limit.",
    detail: 'Try again later.',
    recoverable: false,
  },
  SESSION_EXPIRED: {
    message: 'This translation session has ended.',
    detail: 'Start again whenever you are ready.',
    recoverable: true,
  },
  UNKNOWN_ERROR: {
    message: 'Something went wrong.',
    detail: 'Your stream will continue playing normally.',
    recoverable: true,
  },
};

export function createAppError(
  code: AppErrorCode,
  overrides?: Partial<Pick<AppError, 'message' | 'detail' | 'recoverable'>>,
): AppError {
  const base = ERROR_COPY[code];
  return {
    code,
    message: overrides?.message ?? base.message,
    detail: overrides?.detail ?? base.detail,
    recoverable: overrides?.recoverable ?? base.recoverable,
  };
}
