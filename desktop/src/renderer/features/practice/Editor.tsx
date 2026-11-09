import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { colorize, highlighter, loadedHighlighter, nameOf } from '../../ui/colors';
import { backspace, closer, CLOSERS, indentUnit, newline, tab, type Change } from './indent';

interface Props {
  files: { path: string; text: string }[];
  open: string;
  onOpen: (path: string) => void;
  onChange: (text: string) => void;
  tools: ReactNode;
  /** A reference solution is shown, not edited: its text can be selected and copied, never changed. */
  readOnly?: boolean;
}

/** A code editor: file tabs, line numbers, and the code colored by its file's extension where highlight.js knows it (§4.10). */
export function Editor({ files, open, onOpen, onChange, tools, readOnly }: Props) {
  const id = useId();
  const file = files.find((f) => f.path === open) ?? files[0];
  const lines = file.text.split('\n');
  const [hljs, setHljs] = useState(loadedHighlighter);
  useEffect(() => {
    let live = true;
    void highlighter().then((h) => live && setHljs(h));
    return () => void (live = false);
  }, []);
  const colored = useMemo(() => (hljs ? colorize(hljs, nameOf(file.path), file.text) : undefined), [hljs, file.path, file.text]);
  const copy = useRef<HTMLPreElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // Each file's indent step, read when it first opens (usually its starter code), so a cleared file keeps it.
  const units = useRef(new Map<string, string>());
  if (!units.current.has(file.path)) units.current.set(file.path, indentUnit(file.text));
  // Esc, then Tab, leaves the editor; any other key after Esc keeps Tab indenting.
  const leaving = useRef(false);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (readOnly || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Escape') {
      leaving.current = true;
      return;
    }
    if (e.key === 'Tab' && leaving.current) return;
    leaving.current = false;
    const { value, selectionStart: start, selectionEnd: end } = e.currentTarget;
    const unit = units.current.get(file.path)!;
    let change: Change | null = null;
    if (e.key === 'Enter') change = newline(value, start, end, unit);
    else if (e.key === 'Tab') change = tab(value, start, end, unit, e.shiftKey);
    else if (e.key === 'Backspace') change = backspace(value, start, end, unit);
    else if (e.key.length === 1 && CLOSERS.includes(e.key)) change = closer(value, start, end, unit, e.key);
    if (!change) return;
    e.preventDefault();
    const textarea = e.currentTarget;
    textarea.setSelectionRange(change.from, change.to);
    // insertText keeps the edit in the browser's undo history; where it isn't supported (jsdom), the text is set directly.
    const inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, change.insert);
    if (!inserted) textarea.setRangeText(change.insert, change.from, change.to);
    textarea.setSelectionRange(change.selectStart, change.selectEnd);
    onChange(textarea.value);
  }
  // The copy scrolls with the textarea, also when it first appears over one already scrolled.
  const follow = useCallback(() => {
    if (!copy.current || !area.current) return;
    copy.current.scrollLeft = area.current.scrollLeft;
    copy.current.scrollTop = area.current.scrollTop;
  }, []);
  useLayoutEffect(follow, [colored]);
  return (
    <div className="ed">
      <div className="etool">
        <div className="etabs" role="tablist" aria-label="Files">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              role="tab"
              id={`${id}-${f.path}`}
              className="etab"
              aria-selected={f.path === file.path}
              aria-controls={`${id}-panel`}
              onClick={() => onOpen(f.path)}
            >
              {f.path}
            </button>
          ))}
        </div>
        <div className="actions">{tools}</div>
      </div>
      <div className="ebody" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${file.path}`}>
        <div className="code">
          <div className="lnum" aria-hidden="true">
            {lines.map((_, i) => <span key={i}>{i + 1}</span>)}
          </div>
          <div className="etext">
            {/* highlight.js escapes the code and adds only class names. The copy is for the eyes; the textarea stays the editor. */}
            {colored !== undefined && <pre className="hl" aria-hidden="true" ref={copy} dangerouslySetInnerHTML={{ __html: colored }} />}
            <textarea
              ref={area}
              className={colored !== undefined ? 'lit' : undefined}
              aria-label={file.path}
              aria-describedby={readOnly ? undefined : `${id}-keys`}
              value={file.text}
              readOnly={readOnly}
              rows={lines.length}
              wrap="off"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => (leaving.current = false)}
              onScroll={follow}
            />
            <span className="sr-only" id={`${id}-keys`}>Tab indents. Esc, then Tab, leaves the editor.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
