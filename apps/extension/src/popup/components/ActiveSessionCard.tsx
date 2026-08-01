import { ListeningDot } from '@live-translator/ui';
import { LANGUAGE_LABELS } from '@live-translator/shared';
import type { LanguageCode, SessionStatus } from '@live-translator/protocol';

export function ActiveSessionCard({
  status,
  sourceLanguage,
  targetLanguage,
}: {
  status: SessionStatus;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}) {
  if (status !== 'listening' && status !== 'reconnecting' && status !== 'paused') {
    return null;
  }

  const source = LANGUAGE_LABELS[sourceLanguage === 'auto' ? 'en' : sourceLanguage] ?? 'English';
  const target = LANGUAGE_LABELS[targetLanguage] ?? targetLanguage;

  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 'var(--lt-radius-medium)',
        background: 'var(--lt-surface-elevated)',
        border: '1px solid var(--lt-border)',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--lt-text-primary)',
          marginBottom: 6,
        }}
      >
        Translation is live
      </div>
      <div style={{ fontSize: 12, color: 'var(--lt-text-secondary)', marginBottom: 10 }}>
        {source} → {target}
      </div>
      <ListeningDot label={status === 'reconnecting' ? 'Reconnecting' : 'Listening'} />
    </div>
  );
}
