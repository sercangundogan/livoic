import { Button } from '@live-translator/ui';
import { isActiveSession } from '@live-translator/shared';
import type { SessionStatus } from '@live-translator/protocol';

export function PrimaryActionButton({
  status,
  disabled,
  loading,
  onStart,
  onStop,
}: {
  status: SessionStatus;
  disabled?: boolean;
  loading?: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const active = isActiveSession(status);

  let label = 'Start Translation';
  if (status === 'connecting' || status === 'requesting-permission') label = 'Starting…';
  else if (status === 'reconnecting') label = 'Reconnecting…';
  else if (active) label = 'Stop Translation';

  const isStarting =
    status === 'connecting' || status === 'requesting-permission' || status === 'reconnecting';

  return (
    <Button
      variant={active && !isStarting ? 'secondary' : 'primary'}
      loading={loading || isStarting}
      disabled={disabled && !active}
      onClick={() => (active ? onStop() : onStart())}
    >
      {label}
    </Button>
  );
}
