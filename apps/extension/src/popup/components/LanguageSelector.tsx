import { useMemo, useState } from 'react';
import type { LanguageCode } from '@live-translator/protocol';
import { SUPPORTED_LANGUAGES } from '@live-translator/shared';

export function LanguageSelector({
  value,
  recent,
  onChange,
  disabled,
}: {
  value: LanguageCode;
  recent: LanguageCode[];
  onChange: (code: LanguageCode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = SUPPORTED_LANGUAGES.find((l) => l.code === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = SUPPORTED_LANGUAGES.filter((l) => {
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.includes(q)
      );
    });
    const recentSet = new Set(recent);
    return [
      ...list.filter((l) => recentSet.has(l.code as LanguageCode)),
      ...list.filter((l) => !recentSet.has(l.code as LanguageCode)),
    ].filter((l, i, arr) => arr.findIndex((x) => x.code === l.code) === i);
  }, [query, recent]);

  return (
    <div style={{ marginBottom: 16, position: 'relative' }}>
      <label
        style={{
          display: 'block',
          fontSize: 12,
          color: 'var(--lt-text-muted)',
          marginBottom: 8,
          fontWeight: 500,
        }}
      >
        Translate to
      </label>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          minHeight: 42,
          borderRadius: 'var(--lt-radius-medium)',
          border: '1px solid var(--lt-border)',
          background: 'var(--lt-surface-elevated)',
          color: 'var(--lt-text-primary)',
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 14,
          fontWeight: 500,
          fontFamily: 'var(--lt-font)',
        }}
      >
        <span>{selected?.nativeName ?? value}</span>
        <span aria-hidden style={{ color: 'var(--lt-text-muted)' }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--lt-surface-elevated)',
            border: '1px solid var(--lt-border)',
            borderRadius: 'var(--lt-radius-medium)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            overflow: 'hidden',
          }}
        >
          <input
            autoFocus
            aria-label="Search languages"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              border: 'none',
              borderBottom: '1px solid var(--lt-border)',
              background: 'transparent',
              color: 'var(--lt-text-primary)',
              padding: '10px 12px',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'var(--lt-font)',
            }}
          />
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {filtered.map((lang) => (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={lang.code === value}
                onClick={() => {
                  onChange(lang.code as LanguageCode);
                  setOpen(false);
                  setQuery('');
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  border: 'none',
                  background: lang.code === value ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: 'var(--lt-text-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'var(--lt-font)',
                }}
              >
                {lang.nativeName}
                <span style={{ color: 'var(--lt-text-muted)', marginLeft: 8 }}>{lang.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
