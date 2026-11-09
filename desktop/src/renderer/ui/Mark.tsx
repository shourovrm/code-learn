import { useId } from 'react';
import { useTheme } from '../app/theme';
import logo from '../../../../docs/brand/code-learn-logo.svg';
import logoOnNavy from '../../../../docs/brand/code-learn-logo-dark.svg';

/** The code-learn mark alone: a sprout growing from a cursor. `ink` colors the cursor for the ground it sits on. */
export function Mark({ size = 24, ink = 'var(--garden)' }: { size?: number; ink?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="8" x2="0" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3DDB6C" />
          <stop offset="1" stopColor="#17B04B" />
        </linearGradient>
      </defs>
      <rect x="13" y="47" width="38" height="8" rx="4" fill={ink} />
      <path d="M32 47V24" fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" />
      <path d="M32 33C21 33 14 26 14 16C25 16 32 23 32 33Z" fill={`url(#${id})`} />
      <path d="M32 26C32 15 39 8 50 8C50 19 43 26 32 26Z" fill={`url(#${id})`} />
    </svg>
  );
}

/** The brand logo (the wordmark is outlined, so it needs no font): the light wordmark on garden and in the dark theme. */
export function Logo({ height, onNavy = false, className }: { height: number; onNavy?: boolean; className?: string }) {
  const dark = useTheme() === 'dark';
  return <img className={className} src={onNavy || dark ? logoOnNavy : logo} alt="code-learn" height={height} />;
}
