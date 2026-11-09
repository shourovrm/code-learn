import { extractFile, listPackage } from '@electron/asar';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// #14: the installer carries no development mock or demo curriculum. Reads the
// packaged app named by CODE_LEARN_RESOURCES (set by CI after `npm run dist`).
const resources = process.env.CODE_LEARN_RESOURCES;
// Strings only the mock (src/main/mock.ts) contains: its scenario switch and its demo React course.
// (main.js may still name the mock in its development-only branch; that loads nothing when packaged.)
const DEMO = /Unknown mock scenario|Click Counter|Counter\.jsx/;

test('the packaged app carries no mock or demo curriculum', () => {
  test.skip(!resources, 'needs CODE_LEARN_RESOURCES');
  const asar = join(resources!, 'app.asar');
  // listPackage gives native paths ("\\out\\main\\main.js" on Windows); extractFile needs them without the leading separator.
  const entries = listPackage(asar, { isPack: false }).map((raw) => ({ raw: raw.replace(/^[\\/]/, ''), path: raw.replaceAll('\\', '/').replace(/^\//, '') }));
  const files = entries.map((e) => e.path);
  expect(files).toContain('out/main/main.js');
  expect(files.filter((f) => /mock/i.test(f))).toEqual([]);
  const scripts = entries.filter((e) => e.path.endsWith('.js')).map((e) => [e.path, extractFile(asar, e.raw).toString('utf8')] as const);
  const core = readdirSync(join(resources!, 'core'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
    .map((f) => [`core/${f}`, readFileSync(join(resources!, 'core', f), 'utf8')] as const);
  expect([...scripts, ...core].filter(([, text]) => DEMO.test(text)).map(([f]) => f)).toEqual([]);
});

// The micromamba that installs each track's toolchain (core DESIGN §4.6): this installer's own, with its notice, and runnable.
test('the packaged app carries a micromamba that runs', () => {
  test.skip(!resources, 'needs CODE_LEARN_RESOURCES');
  expect(readdirSync(join(resources!, 'micromamba')).sort()).toEqual(['NOTICE', 'micromamba']);
  expect(readFileSync(join(resources!, 'micromamba', 'NOTICE'), 'utf8')).toContain('BSD-3-Clause');
  expect(execFileSync(join(resources!, 'micromamba', 'micromamba'), ['--version'], { encoding: 'utf8' }).trim()).toMatch(/^2\.\d+\.\d+$/);
});
