import type { ReactNode } from 'react';

export function ListeningDot({ label = 'Listening' }: { label?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        color: 'var(--lt-text-secondary)',
        fontSize: 13,
        fontFamily: 'var(--lt-font)',
      }}
      role="status"
      aria-label={label}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--lt-success)',
          boxShadow: '0 0 0 0 rgba(74, 222, 128, 0.5)',
          animation: 'lt-pulse 1.6s ease-out infinite',
        }}
      />
      {label}
    </span>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--lt-surface)',
        borderRadius: 'var(--lt-radius-large)',
        border: '1px solid var(--lt-border)',
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}
