import type { PageDetection } from '../../shared/messages.js';
import type { SessionStatus } from '@live-translator/protocol';
import { STATUS_COPY } from '@live-translator/shared';

export function DetectionStatus({
  page,
  status,
  errorMessage,
}: {
  page: PageDetection | null;
  status: SessionStatus;
  errorMessage?: string | null;
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

  return (
    <p
      role="status"
      aria-live="polite"
      style={{
        margin: '0 0 16px',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--lt-text-secondary)',
        lineHeight: 1.4,
      }}
    >
      {text}
    </p>
  );
}
