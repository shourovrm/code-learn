// The text size controls: the starting size in Settings (a radio group) and the sidebar's Text size bar (app/textSize.ts).
import { useEffect, useRef, useState } from 'react';
import { chooseDefaultTextSize, resetTextSize, stepTextSize, TEXT_SIZES, useTextSize, useTextSizeDefault } from './textSize';

/** The sizes as a radio group: the one chosen is the starting size next time too. */
export function TextSizeSwitch() {
  const chosen = useTextSizeDefault();
  return (
    <div className="theme-switch text-size-switch" role="radiogroup" aria-label="Text size">
      {TEXT_SIZES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={chosen === option}
          onClick={() => chooseDefaultTextSize(option)}
        >
          {`${option}%`}
        </button>
      ))}
    </div>
  );
}

/** Where the bar opens: right of the sidebar, level with the button that opened it. */
function barPlace(toggle: HTMLElement) {
  const button = toggle.getBoundingClientRect();
  const sidebar = toggle.closest('nav')?.getBoundingClientRect() ?? button;
  return { left: sidebar.right, top: button.top + button.height / 2 };
}

/**
 * One sidebar button that opens a bar beside the sidebar: A−, the size on screen, A+ and Reset, for this session only.
 * Escape, a click outside, or the button again closes it.
 */
export function TextSizeMenu({ slim = false }: { slim?: boolean }) {
  const size = useTextSize();
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!place) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPlace(null);
      toggle.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!bar.current?.contains(target) && !toggle.current?.contains(target)) setPlace(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [place]);
  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="nav text-size-toggle"
        aria-label={slim ? 'Text size' : undefined}
        aria-expanded={place !== null}
        onClick={() => setPlace(place ? null : barPlace(toggle.current!))}
      >
        <span className="aa" aria-hidden="true">A<small>A</small></span>
        {!slim && 'Text size'}
      </button>
      {place && (
        <div ref={bar} className="text-size-bar" style={{ left: place.left, top: place.top }}>
          {/* The name is the words, not "A−", which a screen reader can't say well. */}
          <button type="button" onClick={() => stepTextSize(-1)}><span aria-hidden="true">A−</span><span className="sr-only">Smaller text</span></button>
          <span className="pct">{`${size}%`}</span>
          <button type="button" onClick={() => stepTextSize(1)}><span aria-hidden="true">A+</span><span className="sr-only">Larger text</span></button>
          <span className="sep" aria-hidden="true" />
          <button type="button" className="reset" onClick={resetTextSize}>Reset</button>
        </div>
      )}
    </>
  );
}
