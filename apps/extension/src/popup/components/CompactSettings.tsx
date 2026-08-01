import type { ReactNode } from 'react';
import type { UserSettings } from '../../shared/messages.js';

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--lt-text-secondary)' }}>{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      style={{
        display: 'inline-flex',
        background: 'var(--lt-background)',
        borderRadius: 8,
        padding: 2,
        border: '1px solid var(--lt-border)',
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            border: 'none',
            background: value === opt.value ? 'var(--lt-surface-elevated)' : 'transparent',
            color: value === opt.value ? 'var(--lt-text-primary)' : 'var(--lt-text-muted)',
            fontSize: 11,
            fontWeight: 600,
            padding: '5px 8px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'var(--lt-font)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function CompactSettings({
  open,
  settings,
  audioSecondsToday,
  onChange,
}: {
  open: boolean;
  settings: UserSettings;
  audioSecondsToday: number;
  onChange: (partial: Partial<UserSettings>) => void;
}) {
  if (!open) return null;

  const minutes = Math.floor(audioSecondsToday / 60);

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: '1px solid var(--lt-border)',
        animation: 'lt-fade 180ms ease-out',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--lt-text-primary)',
          marginBottom: 12,
        }}
      >
        Subtitle appearance
      </div>

      <Row label="Text size">
        <Segmented
          value={settings.subtitleSize}
          onChange={(subtitleSize) => onChange({ subtitleSize })}
          options={[
            { value: 'small', label: 'S' },
            { value: 'medium', label: 'M' },
            { value: 'large', label: 'L' },
          ]}
        />
      </Row>

      <Row label="Display">
        <Segmented
          value={settings.subtitleMode === 'source' ? 'translation' : settings.subtitleMode}
          onChange={(subtitleMode) => onChange({ subtitleMode })}
          options={[
            { value: 'translation', label: 'Translation' },
            { value: 'bilingual', label: 'Bilingual' },
          ]}
        />
      </Row>

      <Row label="Background">
        <Segmented
          value={settings.subtitleBackground}
          onChange={(subtitleBackground) => onChange({ subtitleBackground })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'subtle', label: 'Subtle' },
          ]}
        />
      </Row>

      <Row label="Position">
        <Segmented
          value={settings.subtitlePosition}
          onChange={(subtitlePosition) => onChange({ subtitlePosition })}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Mid' },
          ]}
        />
      </Row>

      <p
        style={{
          margin: '12px 0 0',
          fontSize: 11,
          lineHeight: 1.45,
          color: 'var(--lt-text-muted)',
        }}
      >
        Audio from the selected tab is processed only while live translation is active. Audio and
        transcripts are not stored by default.
      </p>

      {minutes > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--lt-text-muted)' }}>
          {minutes} minute{minutes === 1 ? '' : 's'} used today
        </p>
      )}
    </div>
  );
}
