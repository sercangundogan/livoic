import type { PageDetection, GameContextInfo } from '../../shared/messages.js';
import type { SessionStatus } from '@live-translator/protocol';
import { STATUS_COPY } from '@live-translator/shared';

export function DetectionStatus({
  page,
  status,
  errorMessage,
  gameContext,
}: {
  page: PageDetection | null;
  status: SessionStatus;
  errorMessage?: string | null;
  gameContext?: GameContextInfo | null;
}) {
  let text = STATUS_COPY[status];

  if (status === 'idle' || status === 'ready' || status === 'stopped' || status === 'detecting') {
    if (!page || !page.supported) {
      text = 'Open a Twitch stream to begin';
    } else if (!page.hasPlayer) {
      text = 'The video player is not ready yet';
    } else if (page.channel) {
      text = 'Twitch stream detected';
    }
  }

  if (status === 'error' && errorMessage) {
    text = errorMessage;
  }

  const gameName =
    gameContext?.displayName ||
    (gameContext?.profileApplied ? gameContext.displayName : undefined) ||
    page?.gameName;

  return (
    <div style={{ marginBottom: 16 }}>
      <p
        role="status"
        aria-live="polite"
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--lt-text-secondary)',
          lineHeight: 1.4,
        }}
      >
        {text}
      </p>
      {gameName && (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--lt-text-primary)',
            lineHeight: 1.35,
          }}
        >
          {gameContext?.profileApplied
            ? `${gameName} context active`
            : `Category · ${gameName}`}
        </p>
      )}
    </div>
  );
}
