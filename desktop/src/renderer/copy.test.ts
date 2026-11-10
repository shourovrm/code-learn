// The copy gate (docs/copy.md): the words on screen are the learner's, so no implementation word, no apology and no
// exclamation reaches the visible text of a screen. It reads JSX text and the attributes a person sees or hears.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const BANNED = /\b(harness|session|activit(?:y|ies)|tracks?|please|sorry|oops)\b|!/i;
const ATTRIBUTES = new Set(['placeholder', 'title', 'aria-label', 'label', 'alt']);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return ['testing', 'stubs'].includes(entry.name) ? [] : sources(path);
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : [];
  });
}

/** JSX text and the string values of the attributes a person sees or hears, read with the TypeScript parser. */
function visibleText(file: string, source: string): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && node.text.trim()) found.push(node.text.trim());
    if (ts.isJsxAttribute(node) && ATTRIBUTES.has(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer)) {
      found.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  return found;
}

it('keeps implementation words, apologies and exclamations off the screen', () => {
  const found = sources(__dirname).flatMap((file) =>
    visibleText(file, readFileSync(file, 'utf8'))
      .filter((text) => BANNED.test(text))
      .map((text) => `${file.slice(__dirname.length + 1)}: ${text}`),
  );
  expect(found).toEqual([]);
});
