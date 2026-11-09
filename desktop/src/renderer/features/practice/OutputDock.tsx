import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

export type OutputTab = 'terminal' | 'results';

/** The panel's share of the column, in percent: where it starts, its bounds, and one arrow key's step. */
const START = 34;
const MIN = 15;
const MAX = 75;
const STEP = 5;

/**
 * Run output and check results under the code, as two tabs of one panel, so the code keeps most of the column.
 * The panel can be dragged taller or shorter, or folded down to its tabs. `tab` is chosen by the screen: Run shows
 * the terminal, Check and Try it show the results.
 */
export function OutputDock({ terminal, results, tab, onTab }: { terminal?: ReactNode; results: ReactNode; tab: OutputTab; onTab: (tab: OutputTab) => void }) {
  const [open, setOpen] = useState(true);
  const [share, setShare] = useState(START);
  const dock = useRef<HTMLDivElement>(null);
  const shown = terminal ? tab : 'results';

  const resizeTo = (next: number) => setShare(Math.round(Math.min(Math.max(next, MIN), MAX)));
  function drag(e: PointerEvent<HTMLDivElement>) {
    const column = dock.current?.parentElement?.getBoundingClientRect();
    if (e.buttons !== 1 || !column?.height) return;
    resizeTo(((column.bottom - e.clientY) / column.height) * 100);
  }
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowUp') resizeTo(share + STEP);
    else if (e.key === 'ArrowDown') resizeTo(share - STEP);
    else return;
    e.preventDefault();
  }

  return (
    <div className={`dock${open ? '' : ' folded'}`} ref={dock} style={open ? { flexBasis: `${share}%` } : undefined}>
      {open && (
        <div className="dock-grip" role="separator" aria-orientation="horizontal" aria-label="Output size" tabIndex={0}
          aria-valuenow={share} aria-valuemin={MIN} aria-valuemax={MAX} aria-valuetext={`${share}% of the column`}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={drag} onKeyDown={keys} />
      )}
      <div className="dock-bar">
        <div className="dock-tabs" role="tablist" aria-label="Output">
          {terminal && <button type="button" role="tab" aria-selected={shown === 'terminal'} onClick={() => onTab('terminal')}>Terminal</button>}
          <button type="button" role="tab" aria-selected={shown === 'results'} onClick={() => onTab('results')}>Results</button>
        </div>
        <button type="button" className="btn subtle dock-fold" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide output' : 'Show output'}</button>
      </div>
      {terminal && <div className="dock-panel" role="tabpanel" aria-label="Terminal" hidden={!open || shown !== 'terminal'}>{terminal}</div>}
      <div className="dock-panel" role="tabpanel" aria-label="Results" hidden={!open || shown !== 'results'}>{results}</div>
    </div>
  );
}
