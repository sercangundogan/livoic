import type { CSSProperties, ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  children: ReactNode;
};

const baseStyle: CSSProperties = {
  fontFamily: 'var(--lt-font)',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 'var(--lt-radius-medium)',
  border: 'none',
  cursor: 'pointer',
  transition: 'transform var(--lt-transition), filter var(--lt-transition), opacity var(--lt-transition)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '0 16px',
  width: '100%',
  position: 'relative',
};

const variants: Record<NonNullable<ButtonProps['variant']>, CSSProperties> = {
  primary: {
    background: 'var(--lt-accent)',
    color: 'var(--lt-accent-foreground)',
  },
  secondary: {
    background: 'var(--lt-surface-elevated)',
    color: 'var(--lt-text-primary)',
    border: '1px solid var(--lt-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--lt-text-secondary)',
  },
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={{
        ...baseStyle,
        ...variants[variant],
        opacity: isDisabled ? 0.55 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      onMouseDown={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.transform = 'scale(0.98)';
        }
        rest.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        rest.onMouseUp?.(e);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        rest.onMouseLeave?.(e);
      }}
      {...rest}
    >
      {loading ? (
        <>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              animation: 'lt-spin 0.7s linear infinite',
              flexShrink: 0,
            }}
          />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
