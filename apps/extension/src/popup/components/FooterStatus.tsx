import type { SessionStatus } from '@live-translator/protocol';

export function FooterStatus({ status }: { status: SessionStatus }) {
  if (status !== 'error' && status !== 'reconnecting') return null;

  return (
    <div
      style={{
        marginTop: 12,
        fontSize: 12,
        color: status === 'error' ? 'var(--lt-danger)' : 'var(--lt-warning)',
        lineHeight: 1.4,
      }}
      role="alert"
    >
      {status === 'reconnecting'
        ? 'The connection was interrupted. Reconnecting…'
        : "We couldn't restore the connection."}
    </div>
  );
}
