import { useEffect, useReducer, useState } from 'react';
import type { Drawn } from './drawDiagram';

/** A diagram's drawing, or null when it can't be drawn. Kept so a lesson reopens at once (§4.3), and drawn once. */
interface Drawing {
  value?: Drawn | null;
  done: Promise<unknown>;
}
const drawings = new Map<string, Drawing>();
const KEPT = 50;

function drawing(source: string): Drawing {
  let d = drawings.get(source);
  if (!d) {
    if (drawings.size >= KEPT) drawings.delete(drawings.keys().next().value!);
    const fresh: Drawing = { done: Promise.resolve() };
    // The drawing code, and mermaid with it, loads here and only here.
    fresh.done = import('./drawDiagram').then((m) => m.drawDiagram(source)).then((v) => (fresh.value = v), () => (fresh.value = null));
    drawings.set(source, (d = fresh));
  }
  return d;
}

/**
 * A diagram from a lesson's mermaid fence, drawn as an image with a text alternative. When it can't be drawn, its
 * source is shown as code with a short note, and the rest of the lesson reads as usual.
 */
export function Diagram({ source }: { source: string }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const d = drawing(source);
  useEffect(() => {
    let live = true;
    void d.done.then(() => live && redraw());
    return () => {
      live = false;
    };
  }, [d]);
  if (d.value === undefined) return <figure className="diagram wait" aria-busy="true" />;
  if (d.value === null) return <FailedDiagram source={source} />;
  return (
    <figure className="diagram">
      <img src={d.value.src} alt={d.value.alt} />
    </figure>
  );
}

/** The source of a diagram that didn't draw, shown in the lesson's flow until the learner hides it. */
function FailedDiagram({ source }: { source: string }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" className="diagram-chip" aria-pressed={shown} onClick={() => setShown(!shown)}>
        <span aria-hidden="true">{shown ? '◆' : '◇'}</span>
        Diagram
      </button>
      {shown && (
        <div className="diagram-failed">
          <div className="head">
            <span aria-hidden="true">⚠</span>
            <span>This diagram didn&apos;t draw. Here is its source.</span>
            <button type="button" className="x" aria-label="Hide diagram" onClick={() => setShown(false)}>
              ✕
            </button>
          </div>
          <div className="md"><pre><code>{source}</code></pre></div>
        </div>
      )}
    </>
  );
}
