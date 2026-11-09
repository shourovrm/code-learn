// Indenting in the code editor, the same for every language: it reads only brackets, colons and leading whitespace,
// never the language's name (AGENTS.md: code-learn ships no languages). Each function takes the text and the
// selection and returns the one change to make, or null to let the key do what it always does.

/** Replace the text from `from` to `to` with `insert`, then select from `selectStart` to `selectEnd`. */
export interface Change {
  from: number;
  to: number;
  insert: string;
  selectStart: number;
  selectEnd: number;
}

/** A line that ends with one of these opens a block, so the next line goes one step in. */
const OPENS_BLOCK = /[{([:]\s*$/;
export const CLOSERS = '}])';

/** The file's own indent step: a tab, or its narrowest run of leading spaces (at least two); four spaces by default. */
export function indentUnit(text: string): string {
  if (/^\t/m.test(text)) return '\t';
  const widths = [...text.matchAll(/^( +)\S/gm)].map((m) => m[1]!.length);
  return widths.length === 0 ? '    ' : ' '.repeat(Math.max(2, Math.min(...widths)));
}

const lineStart = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1;
const leadOf = (line: string) => /^[ \t]*/.exec(line)![0];

/** Enter: the new line keeps this line's indent, one step more after a line that opens a block. */
export function newline(text: string, start: number, end: number, unit: string): Change {
  const before = text.slice(lineStart(text, start), start);
  const lead = leadOf(before);
  if (!OPENS_BLOCK.test(before)) return caretAfter(start, end, `\n${lead}`);
  const inner = `\n${lead}${unit}`;
  // Between an opener and its closer, as in `{|}`: the closer moves to its own line at this line's indent.
  const next = text[end];
  if (next !== undefined && CLOSERS.includes(next)) return { from: start, to: end, insert: `${inner}\n${lead}`, selectStart: start + inner.length, selectEnd: start + inner.length };
  return caretAfter(start, end, inner);
}

/** Tab adds a step at the cursor, or to every line of a selection; Shift+Tab takes one off. */
export function tab(text: string, start: number, end: number, unit: string, outdent: boolean): Change {
  if (start === end && !outdent) return caretAfter(start, end, unit);
  const from = lineStart(text, start);
  // A selection that ends at the start of a line doesn't take that line.
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const lineEnd = text.indexOf('\n', last);
  const to = lineEnd === -1 ? text.length : lineEnd;
  const lines = text.slice(from, to).split('\n');
  const changed = lines.map((line) => (outdent ? line.slice(stepOff(line, unit)) : line && unit + line));
  const insert = changed.join('\n');
  if (start === end) {
    const caret = Math.max(from, start - stepOff(lines[0]!, unit));
    return { from, to, insert, selectStart: caret, selectEnd: caret };
  }
  return { from, to, insert, selectStart: from, selectEnd: from + insert.length };
}

/** A closer typed on a line that is only indent takes a step off the line first. */
export function closer(text: string, start: number, end: number, unit: string, key: string): Change | null {
  const from = lineStart(text, start);
  const before = text.slice(from, start);
  if (!before || before.trim() !== '') return null;
  const insert = before.slice(stepOff(before, unit)) + key;
  return { from, to: end, insert, selectStart: from + insert.length, selectEnd: from + insert.length };
}

/** Backspace inside a run of spaces before any text deletes back to the step before. */
export function backspace(text: string, start: number, end: number, unit: string): Change | null {
  const before = text.slice(lineStart(text, start), start);
  if (start !== end || unit === '\t' || !before || before.trim() !== '' || before.includes('\t')) return null;
  const width = before.length % unit.length || unit.length;
  return { from: start - width, to: start, insert: '', selectStart: start - width, selectEnd: start - width };
}

/** How many leading characters one step off would remove: a tab, a whole step of spaces, or the spaces there are. */
function stepOff(line: string, unit: string): number {
  if (line.startsWith('\t')) return 1;
  return Math.min(leadOf(line).replace(/\t.*/, '').length, unit === '\t' ? 4 : unit.length);
}

const caretAfter = (start: number, end: number, insert: string): Change => ({ from: start, to: end, insert, selectStart: start + insert.length, selectEnd: start + insert.length });
