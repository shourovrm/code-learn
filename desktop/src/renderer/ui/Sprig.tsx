import type { ReactNode } from 'react';

export type Mood = 'ready' | 'cheer' | 'think' | 'look' | 'soft' | 'sleep' | 'wake';

// Pot, pot shade, rim. The first is Sprig's own terracotta; the others mark a track or course, and their shade is
// also the course badge's color (hueColor).
const PALETTES = [
  ['#E9894A', '#C96A2E', '#F4A66E'],
  ['#2CC3E8', '#109CC0', '#7FDDF3'],
  ['#6F8BE0', '#4566C8', '#A3B6EE'],
  ['#9A7BE0', '#6E4FC2', '#C2AEF0'],
];

/** A stable color for a track or course name. Sprig's pot is terracotta with no name. */
export function hue(name?: string): number {
  if (!name) return 0;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 1 + (h % (PALETTES.length - 1));
}

export function hueColor(name?: string): string {
  return PALETTES[hue(name)][1];
}

const INK = '#0E2754';
const LEAF = '#2DC65B';
const LEAF_DARK = '#17A045';

/** Both eyes, their pupils moved by (dx, dy) to look somewhere. */
const eyes = (dx = 0, dy = 0) => (
  <g className="eye">
    {[84, 116].map((x) => (
      <g key={x}>
        <circle cx={x + dx} cy={118 + dy} r="8" fill={INK} />
        <circle cx={x + dx + 2.5} cy={115 + dy} r="2.6" fill="#fff" />
      </g>
    ))}
  </g>
);
const line = (d: string, w = 3.6) => <path d={d} fill="none" stroke={INK} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;

/** How far each leaf turns about its base, in degrees: drooping when sleepy, lifted when cheering. */
type Leaves = { left: number; right: number };

function face(mood: Mood, pot: string): { eye: ReactNode; mouth: ReactNode; leaves: Leaves; extra?: ReactNode } {
  const smile = line('M91 132 Q 100 140 109 132');
  const upright = { left: 0, right: 0 };
  switch (mood) {
    case 'cheer':
      return {
        eye: <g className="eye">{line('M76 120 Q 84 111 92 120', 4)}{line('M108 120 Q 116 111 124 120', 4)}</g>,
        mouth: <><path d="M89 129 Q 100 148 111 129 Z" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" /><path d="M95 136 Q 100 142 105 136 Z" fill="#FF8FA3" /></>,
        leaves: { left: 18, right: -18 },
        extra: <>
          <path className="spark" d="M150 20 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#F2B705" />
          <path className="spark" style={{ animationDelay: '.5s' }} d="M46 34 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#F2B705" />
        </>,
      };
    case 'think':
      return { eye: eyes(3, -4), mouth: line('M93 135 L 108 132'), leaves: { left: -14, right: 10 } };
    case 'look':
      return { eye: eyes(-4, 2), mouth: smile, leaves: upright };
    case 'soft':
      return { eye: eyes(0, 1), mouth: line('M93 133 Q 100 137 107 133'), leaves: { left: -6, right: 6 } };
    case 'sleep':
      return {
        eye: <g className="eye">{line('M76 118 Q 84 125 92 118')}{line('M108 118 Q 116 125 124 118')}</g>,
        mouth: line('M95 134 Q 100 136 105 134', 3),
        leaves: { left: -38, right: 38 },
        extra: <>
          <text className="zz" style={{ fontFamily: 'var(--display)' }} x="146" y="54" fontSize="20" fontWeight="600" fill="#AFC0DD">z</text>
          <text className="zz" style={{ fontFamily: 'var(--display)', animationDelay: '.8s' }} x="160" y="34" fontSize="26" fontWeight="600" fill="#AFC0DD">Z</text>
        </>,
      };
    case 'wake':
      return {
        eye: <>{eyes()}<rect className="lid" x="72" y="108" width="56" height="20" fill={pot} /></>,
        mouth: smile,
        leaves: upright,
      };
    default:
      return { eye: eyes(), mouth: smile, leaves: upright };
  }
}

/** Sprig, code-learn's mascot: a seedling in a pot. Decorative: whatever Sprig means is said in text nearby. */
export function Sprig({ mood = 'ready', width = 160, perch = false, name }: { mood?: Mood; width?: number; perch?: boolean; name?: string }) {
  const [pot, shade, rim] = PALETTES[hue(name)];
  const { eye, mouth, leaves, extra } = face(mood, pot);
  return (
    <svg className={`sprig ${mood}`} viewBox="0 0 200 170" width={width} height={Math.round((width * 170) / 200)} aria-hidden="true">
      {/* The shelf follows the theme; the face keeps INK, since it sits on the pot's own color. */}
      {perch && <rect x="30" y="160" width="140" height="10" rx="5" style={{ fill: 'var(--perch)' }} />}
      <path d="M100 80 V 50" stroke={LEAF_DARK} strokeWidth="6" strokeLinecap="round" />
      <g className="leaf" transform={`rotate(${leaves.left} 100 60)`}>
        <path d="M100 60 C 80 60 64 46 64 24 C 86 24 100 38 100 60 Z" fill={LEAF} />
        <path d="M98 57 Q 84 40 70 30" fill="none" stroke={LEAF_DARK} strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="leaf" transform={`rotate(${leaves.right} 100 52)`}>
        <path d="M100 52 C 100 30 116 14 140 14 C 140 36 124 52 100 52 Z" fill={LEAF} />
        <path d="M102 49 Q 118 32 134 20" fill="none" stroke={LEAF_DARK} strokeWidth="3" strokeLinecap="round" />
      </g>
      <path d="M56 94 H 144 L 134 154 Q 132.5 162 124.5 162 H 75.5 Q 67.5 162 66 154 Z" fill={pot} />
      <path d="M128 94 H 144 L 134 154 Q 132.5 162 124.5 162 H 120 Z" fill={shade} opacity=".55" />
      <rect x="48" y="78" width="104" height="20" rx="10" fill={rim} />
      {eye}
      {mouth}
      <circle cx="72" cy="132" r="5" fill="#FF8FA3" opacity=".7" />
      <circle cx="128" cy="132" r="5" fill="#FF8FA3" opacity=".7" />
      {extra}
    </svg>
  );
}
