// The slim sidebar's tooltip: each icon's name beside it, on hover and on keyboard focus. Drawn by code-learn
// rather than left to the native `title` tooltip, which some Linux window managers never show.
import { useEffect, useId, useState, type RefObject } from 'react';

type Tip = { text: string; left: number; top: number };

/** The button under the pointer or focus, if it is one the slim sidebar names only in its aria-label. */
function namedButton(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('button[aria-label]');
}

/** Shows the hovered or focused button's name beside `nav`. Escape hides it (WCAG 1.4.13). */
export function SlimTooltip({ nav }: { nav: RefObject<HTMLElement | null> }) {
  const id = useId();
  const [tip, setTip] = useState<Tip>();
  useEffect(() => {
    const root = nav.current;
    if (!root) return;
    const show = (event: Event) => {
      const button = namedButton(event.target);
      if (!button || !root.contains(button)) return;
      const box = button.getBoundingClientRect();
      setTip({ text: button.getAttribute('aria-label')!, left: box.right + 8, top: box.top + box.height / 2 });
    };
    const hide = () => setTip(undefined);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    root.addEventListener('pointerover', show);
    root.addEventListener('pointerout', hide);
    root.addEventListener('focusin', show);
    root.addEventListener('focusout', hide);
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('pointerover', show);
      root.removeEventListener('pointerout', hide);
      root.removeEventListener('focusin', show);
      root.removeEventListener('focusout', hide);
      window.removeEventListener('keydown', onKey);
    };
  }, [nav]);
  if (!tip) return null;
  return (
    <div id={id} role="tooltip" className="slim-tip" style={{ left: tip.left, top: tip.top }}>
      {tip.text}
    </div>
  );
}
