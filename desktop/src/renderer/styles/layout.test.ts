// jsdom does no layout, so the rules that keep the page from scrolling are checked as written. The bug they stop was
// seen in the app: a long tutor chat made the workspace's row as tall as the chat, and Check's scrollIntoView then
// scrolled the whole window, top bar and sidebar included.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = ['foundation', 'workspace', 'progress', 'setup'].map((name) => readFileSync(resolve(__dirname, `${name}.css`), 'utf8')).join('\n');
const rule = (selector: string) => css.split('\n').find((line) => line.startsWith(`${selector} {`)) ?? '';

describe('the page never scrolls', () => {
  it("gives the workspace one row as tall as the window, so a long column scrolls inside itself", () => {
    expect(rule('.ws')).toContain('grid-template-rows: minmax(0, 1fr)');
    // Stacked in a narrow window, the rows are as tall as their content and the workspace scrolls.
    expect(css).toMatch(/\.ws, \.ws\.lesson, \.ws\.quiz \{[^}]*grid-template-rows: none; overflow-y: auto;/);
  });

  it('clips the window, which a scrollIntoView cannot scroll', () => {
    expect(rule('.win')).toContain('overflow: clip');
  });
});

describe("the learner's own words", () => {
  it('keep their line breaks and wrap a long word, in a note and in the chat', () => {
    for (const selector of ['.my-note span', '.you']) {
      expect(rule(selector)).toContain('white-space: pre-wrap');
      expect(rule(selector)).toContain('overflow-wrap: anywhere');
      expect(rule(selector)).toContain('min-width: 0');
    }
  });
});

describe('code shows the characters typed', () => {
  // JetBrains Mono joins "!=" into "≠", and the font shorthand turns ligatures back on under the body's "none". In the
  // editor the colored copy is what the learner sees, so "if node != -1:" read as "if node  = -1:".
  it('turns ligatures off in every rule that sets the mono font', () => {
    const mono = css.split('\n').filter((line) => line.includes('var(--mono)') && !line.startsWith(':root'));
    expect(mono.length).toBeGreaterThan(0);
    for (const line of mono) expect(line).toMatch(/var\(--mono\).*font-variant-ligatures: none/);
  });
});

// The lesson rules ask for a table when things are compared on the same points; browser defaults draw it without lines.
describe("a lesson's tables, lists and quotes", () => {
  it('rules every cell and sets the header row apart', () => {
    expect(rule('.md :is(th, td)')).toMatch(/border: var\(--border\) solid var\(--line\)/);
    expect(rule('.md th')).toMatch(/background: var\(--soft\)/);
  });

  it('spaces lists and marks a quote', () => {
    expect(rule('.md :is(ul, ol)')).toMatch(/margin: 0 0 var\(--space-150\)/);
    expect(rule('.md blockquote')).toMatch(/border-left: var\(--border-bold\) solid var\(--line\)/);
  });
});
