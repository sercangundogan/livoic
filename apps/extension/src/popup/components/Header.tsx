export function Header({ onSettings }: { onSettings: () => void }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(145deg, #f7f7f8 0%, #a7abb4 100%)',
            display: 'grid',
            placeItems: 'center',
            color: '#101114',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          LT
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--lt-text-primary)',
          }}
        >
          Live Translator
        </h1>
      </div>
      <button
        type="button"
        aria-label="Subtitle appearance settings"
        onClick={onSettings}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: '1px solid var(--lt-border)',
          background: 'var(--lt-surface-elevated)',
          color: 'var(--lt-text-secondary)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 7h16M7 12h10M9 17h6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </header>
  );
}
