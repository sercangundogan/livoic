/**
 * Overlay React components — reference UI for subtitle rendering.
 * Production overlay is injected via Shadow DOM in OverlayController
 * for minimal content-script overhead; these mirror the same visuals.
 */
import type { CSSProperties } from 'react';

export function SubtitleLine({
  text,
  partial = false,
  dominant = true,
}: {
  text: string;
  partial?: boolean;
  dominant?: boolean;
}) {
  const style: CSSProperties = {
    margin: 0,
    color: '#fff',
    fontWeight: dominant ? 600 : 500,
    lineHeight: 1.35,
    textAlign: 'center',
    opacity: partial ? 0.55 : dominant ? 1 : 0.7,
    textShadow: '0 2px 4px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.75)',
  };
  return <p style={style}>{text}</p>;
}

export function StatusPill({ label }: { label: string }) {
  return (
    <div
      role="status"
      style={{
        background: 'rgba(20,22,27,0.82)',
        color: '#f7f7f8',
        fontSize: 12,
        fontWeight: 500,
        padding: '6px 10px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {label}
    </div>
  );
}

export function SubtitleOverlay({
  lines,
  sourceLines,
  partial,
}: {
  lines: string[];
  sourceLines?: string[];
  partial?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {sourceLines?.map((line) => (
        <SubtitleLine key={`s-${line}`} text={line} dominant={false} partial={partial} />
      ))}
      {lines.map((line) => (
        <SubtitleLine key={`t-${line}`} text={line} partial={partial} />
      ))}
    </div>
  );
}
