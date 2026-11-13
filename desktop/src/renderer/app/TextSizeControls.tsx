// The text size controls: the starting size in Settings (a radio group) and A−/A+ in the sidebar (app/textSize.ts).
import { chooseDefaultTextSize, stepTextSize, TEXT_SIZES, useTextSize, useTextSizeDefault } from './textSize';

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

/** A− and A+ for this session only; the percentage says what is on screen. */
export function TextSizeButtons() {
  const size = useTextSize();
  return (
    <div className="text-size">
      {/* The name is the words, not "A−", which a screen reader can't say well. */}
      <button type="button" onClick={() => stepTextSize(-1)}><span aria-hidden="true">A−</span><span className="sr-only">Smaller text</span></button>
      <span>{`${size}%`}</span>
      <button type="button" onClick={() => stepTextSize(1)}><span aria-hidden="true">A+</span><span className="sr-only">Larger text</span></button>
    </div>
  );
}
