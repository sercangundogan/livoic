import { ListeningDot } from '@live-translator/ui';
import { LANGUAGE_LABELS } from '@live-translator/shared';
import type { LanguageCode, SessionStatus } from '@live-translator/protocol';
import type { GameContextInfo, PageDetection } from '../../shared/messages.js';

export function ActiveSessionCard({
  status,
  sourceLanguage,
  targetLanguage,
  gameContext,
  page,
}: {
  status: SessionStatus;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  gameContext?: GameContextInfo | null;
  page?: PageDetection | null;
}) {
  if (status !== 'listening' && status !== 'reconnecting' && status !== 'paused') {
    return null;
  }

  const source = LANGUAGE_LABELS[sourceLanguage === 'auto' ? 'en' : sourceLanguage] ?? 'English';
  const target = LANGUAGE_LABELS[targetLanguage] ?? targetLanguage;

  const gameName = gameContext?.displayName || page?.gameName;
  const gameLabel = gameContext?.profileApplied
    ? `${gameName ?? 'Game'} context active`
    : gameName
      ? `Category · ${gameName}`
      : null;

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
      <div style={{ fontSize: 12, color: 'var(--lt-text-secondary)', marginBottom: 8 }}>
        {source} → {target}
      </div>
      {gameLabel && (
        <div style={{ fontSize: 11, color: 'var(--lt-text-muted)', marginBottom: 10 }}>{gameLabel}</div>
      )}
      <ListeningDot label={status === 'reconnecting' ? 'Reconnecting' : 'Listening'} />
    </div>
  );
}
