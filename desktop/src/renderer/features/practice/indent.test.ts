import { describe, expect, it } from 'vitest';
import { backspace, closer, indentUnit, newline, tab, type Change } from './indent';

/** The text after a change, with `|` where the cursor lands (or `[...]` around the selection). */
function after(text: string, change: Change | null): string {
  if (!change) return 'unchanged';
  const next = text.slice(0, change.from) + change.insert + text.slice(change.to);
  const { selectStart: s, selectEnd: e } = change;
  return s === e ? `${next.slice(0, s)}|${next.slice(s)}` : `${next.slice(0, s)}[${next.slice(s, e)}]${next.slice(e)}`;
}

/** Calls `edit` with the text and the cursor or selection marked by `|` or `[...]`. */
function at(marked: string, edit: (text: string, start: number, end: number) => Change | null): string {
  const text = marked.replace(/[|[\]]/g, '');
  const start = marked.search(/[|[]/);
  const end = marked.includes('[') ? marked.indexOf(']') - 1 : start;
  return after(text, edit(text, start, end));
}

describe('the indent step', () => {
  it("is the file's own: a tab, or its narrowest run of leading spaces, and four spaces when nothing is indented", () => {
    expect(indentUnit('if x:\n\ty = 1')).toBe('\t');
    expect(indentUnit('function f() {\n  if (x) {\n    y();\n  }\n}')).toBe('  ');
    expect(indentUnit('for x in y:\n    print(x)')).toBe('    ');
    expect(indentUnit('print(1)')).toBe('    ');
  });
});

describe('Enter', () => {
  it("keeps the line's indent, and adds a step after a line that opens a block", () => {
    expect(at('    x = 1|', (t, s, e) => newline(t, s, e, '    '))).toBe('    x = 1\n    |');
    expect(at('for row in grid:|', (t, s, e) => newline(t, s, e, '    '))).toBe('for row in grid:\n    |');
    expect(at('  for (const c of row) {|', (t, s, e) => newline(t, s, e, '  '))).toBe('  for (const c of row) {\n    |');
  });

  it('opens a block between a bracket and its closer, with the closer on its own line', () => {
    expect(at('if (x) {|}', (t, s, e) => newline(t, s, e, '  '))).toBe('if (x) {\n  |\n}');
  });
});

describe('Tab and Shift+Tab', () => {
  it('Tab adds a step at the cursor, and to every line of a selection', () => {
    expect(at('x|', (t, s, e) => tab(t, s, e, '  ', false))).toBe('x  |');
    expect(at('[a\nb]', (t, s, e) => tab(t, s, e, '  ', false))).toBe('[  a\n  b]');
  });

  it('Shift+Tab takes a step off the line or every selected line', () => {
    expect(at('    x|', (t, s, e) => tab(t, s, e, '    ', true))).toBe('x|');
    expect(at('[  a\n    b]', (t, s, e) => tab(t, s, e, '  ', true))).toBe('[a\n  b]');
  });
});

describe('closing a block', () => {
  it('a closer typed on a blank indented line takes a step off it', () => {
    expect(at('if (x) {\n    |', (t, s, e) => closer(t, s, e, '  ', '}'))).toBe('if (x) {\n  }|');
  });

  it('a closer after other text is typed as usual', () => {
    expect(at('  f(a|', (t, s, e) => closer(t, s, e, '  ', ')'))).toBe('unchanged');
  });
});

describe('Backspace', () => {
  it('in the indent, deletes back to the step before, so leaving a Python block is one key', () => {
    expect(at('    |', (t, s, e) => backspace(t, s, e, '    '))).toBe('|');
    expect(at('      |', (t, s, e) => backspace(t, s, e, '    '))).toBe('    |');
  });

  it('after other text, or with tabs, deletes one character as usual', () => {
    expect(at('  x|', (t, s, e) => backspace(t, s, e, '  '))).toBe('unchanged');
    expect(at('\t|', (t, s, e) => backspace(t, s, e, '\t'))).toBe('unchanged');
  });
});
