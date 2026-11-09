import type { CSSProperties } from 'react';
import { Sprig } from './Sprig';

/**
 * Sprig as a progress fill (§4.11): a grey Sprig, with a colored Sprig clipped from the bottom of the pot up to the
 * leaves as far as `value` (0 to 1). Both are the same artwork, so the fill keeps Sprig's exact shape. The fill edge
 * shimmers while it runs; full, Sprig's eyes open. Decorative: the progressbar around it says what it means.
 */
export function SprigFill({ value, width, dim = false }: { value: number; width: number; dim?: boolean }) {
  const full = value >= 1;
  const fill = { '--fill': `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` } as CSSProperties;
  return (
    <span className={`sprig-fill${dim ? ' dim' : ''}${full ? ' full' : ''}`} style={{ ...fill, width }} aria-hidden="true">
      <span className="sprig-base"><Sprig mood="sleep" width={width} /></span>
      <span className="sprig-color"><Sprig mood={full ? 'wake' : 'sleep'} width={width} /></span>
      {!full && <span className="sprig-edge"><Sprig mood="sleep" width={width} /></span>}
    </span>
  );
}
