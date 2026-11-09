// How far a topic, lesson or exercise has come, drawn from the logo's sprout (docs/design-system.md, Imagery):
// a seed not started, a shoot under way, a sprout done. Colours come from --leaf and --seed, so a field such as the
// exercise statement can set its own.
import type { ReactNode } from 'react';

export type Stage = 'seed' | 'shoot' | 'sprout';

const SOIL = <rect x="6" y="20" width="12" height="2" rx="1" style={{ fill: 'var(--seed)' }} />;

const ART: Record<Stage, ReactNode> = {
  seed: (
    <>
      <rect x="6" y="20" width="12" height="2" rx="1" style={{ fill: 'currentColor', opacity: 0.45 }} />
      <ellipse cx="12" cy="17" rx="3.5" ry="2.5" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }} />
    </>
  ),
  shoot: (
    <>
      <path d="M12 18v-6" style={{ fill: 'none', stroke: 'var(--leaf)', strokeWidth: 2, strokeLinecap: 'round' }} />
      <path d="M12 13c0-3.5 2.2-6 6-6 0 3.5-2.2 6-6 6Z" style={{ fill: 'var(--leaf)' }} />
      <ellipse cx="12" cy="19.5" rx="5" ry="3" style={{ fill: 'var(--seed)' }} />
    </>
  ),
  sprout: (
    <>
      {SOIL}
      <path d="M12 20v-9" style={{ fill: 'none', stroke: 'var(--leaf)', strokeWidth: 2, strokeLinecap: 'round' }} />
      <path d="M12 14C8 14 5 11.5 5 8c4 0 7 2.5 7 6Z" style={{ fill: 'var(--leaf)' }} />
      <path d="M12 11c0-4 2.5-6.5 7-6.5 0 4-2.5 6.5-7 6.5Z" style={{ fill: 'var(--leaf)' }} />
    </>
  ),
};

/** Decorative: the stage is also said in words beside it, so it is hidden from screen readers. */
export function Growth({ stage, size = 24 }: { stage: Stage; size?: number }) {
  return (
    <svg className={`growth ${stage}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ART[stage]}
    </svg>
  );
}
