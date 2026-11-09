// The design system's gate (docs/design-system.md, Gates): every size and colour comes from tokens.css, so a page
// file holds no raw px, no colour literal and no weight outside 400 to 700. Sizes a page alone needs may be named in a
// :root block at the top of its own file; colours may not.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES = ['foundation', 'workspace', 'progress', 'setup'];
const BREAKPOINTS = new Set(['320', '480', '560', '768', '1024', '1440', '1768']);

function problems(name: string): string[] {
  const css = readFileSync(resolve(__dirname, `${name}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const found: string[] = [];
  for (const media of css.matchAll(/@media([^{]*)\{/g)) {
    for (const [, px] of media[1]!.matchAll(/(\d+(?:\.\d+)?)px/g)) if (!BREAKPOINTS.has(px!)) found.push(`breakpoint ${px}px`);
  }
  const rules = css.replace(/@media[^{]*\{/g, '{');
  const outsideRoot = rules.replace(/:root\s*\{[^}]*\}/g, '');
  for (const [px] of outsideRoot.matchAll(/(?<![\w-])\d*\.?\d+px/g)) found.push(`size ${px}`);
  for (const [rem] of outsideRoot.matchAll(/(?<![\w-])\d*\.?\d+rem/g)) found.push(`size ${rem}`);
  for (const [colour] of rules.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g)) found.push(`colour ${colour}`);
  for (const [, weight] of rules.matchAll(/font-weight:\s*(\d+)/g)) if (!['400', '500', '600', '700'].includes(weight!)) found.push(`weight ${weight}`);
  return found;
}

describe('every stylesheet takes its sizes and colours from tokens.css', () => {
  for (const name of PAGES) {
    it(`${name}.css`, () => {
      expect(problems(name)).toEqual([]);
    });
  }
});
