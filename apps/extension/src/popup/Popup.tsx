import { useEffect } from 'react';
import { isActiveSession } from '@live-translator/shared';
import { usePopupStore } from './popup-store.js';
import { Header } from './components/Header.js';
import { DetectionStatus } from './components/DetectionStatus.js';
import { LanguageSelector } from './components/LanguageSelector.js';
import { PrimaryActionButton } from './components/PrimaryActionButton.js';
import { ActiveSessionCard } from './components/ActiveSessionCard.js';
import { CompactSettings } from './components/CompactSettings.js';
import { FooterStatus } from './components/FooterStatus.js';

export function Popup() {
  const {
    status,
    page,
    settings,
    error,
    sourceLanguage,
    targetLanguage,
    audioSecondsToday,
    loading,
    settingsOpen,
    hydrate,
    start,
    stop,
    setTargetLanguage,
    updateSettings,
    setSettingsOpen,
  } = usePopupStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const canStart =
    Boolean(page?.supported && page.hasPlayer) || isActiveSession(status);

  return (
    <div
      style={{
        width: 360,
        padding: 18,
        background: 'var(--lt-background)',
        color: 'var(--lt-text-primary)',
        fontFamily: 'var(--lt-font)',
        minHeight: 220,
      }}
    >
      <Header onSettings={() => setSettingsOpen(!settingsOpen)} />
      <DetectionStatus page={page} status={status} errorMessage={error?.message} />

      <LanguageSelector
        value={targetLanguage}
        recent={settings.recentLanguages}
        onChange={(code) => void setTargetLanguage(code)}
        disabled={isActiveSession(status)}
      />

      <PrimaryActionButton
        status={status}
        disabled={!canStart}
        loading={loading && status !== 'listening'}
        onStart={() => void start()}
        onStop={() => void stop()}
      />

      <ActiveSessionCard
        status={status}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
      />

      {error?.detail && status === 'error' && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12,
            color: 'var(--lt-text-muted)',
            lineHeight: 1.4,
          }}
        >
          {error.detail}
        </p>
      )}

      {status === 'error' && error?.recoverable && (
        <button
          type="button"
          onClick={() => void start()}
          style={{
            marginTop: 12,
            width: '100%',
            minHeight: 36,
            borderRadius: 10,
            border: '1px solid var(--lt-border)',
            background: 'transparent',
            color: 'var(--lt-text-primary)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
            fontFamily: 'var(--lt-font)',
          }}
        >
          Try Again
        </button>
      )}

      <CompactSettings
        open={settingsOpen}
        settings={settings}
        audioSecondsToday={audioSecondsToday}
        onChange={(partial) => void updateSettings(partial)}
      />

      <FooterStatus status={status} />
    </div>
  );
}
