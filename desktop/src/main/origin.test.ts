// @vitest-environment node
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSP, fileFor, fromAppWindow } from './origin';

const root = join('/app', 'out', 'renderer');

describe('the app origin (§2.1, D2)', () => {
  it('serves only files under the renderer folder on app://code-learn', () => {
    expect(fileFor('app://code-learn/index.html', root)).toBe(join(root, 'index.html'));
    expect(fileFor('app://code-learn/', root)).toBe(join(root, 'index.html'));
    expect(fileFor('app://code-learn/assets/main-1.js?x=1#y', root)).toBe(join(root, 'assets', 'main-1.js'));
    // The URL parser resolves `..` first, so these stay inside the renderer folder.
    expect(fileFor('app://code-learn/../main/main.js', root)).toBe(join(root, 'main', 'main.js'));
    expect(fileFor('app://code-learn/%2e%2e/main/main.js', root)).toBe(join(root, 'main', 'main.js'));
    for (const url of [
      'app://code-learn/assets/..%2f..%2fmain.js',
      'app://code-learn/..%2f..%2fpreload/preload.js',
      'app://code-learn/%00.html',
      'app://evil/index.html',
      'file:///app/out/renderer/index.html',
      'https://code-learn/index.html',
      'not a url',
    ]) {
      expect([url, fileFor(url, root)]).toEqual([url, null]);
    }
  });

  it("answers IPC only from the app window's top frame on the app origin", () => {
    const top = { url: 'app://code-learn/index.html' };
    const window = { mainFrame: top };
    const windows = new Set([window]);
    expect(fromAppWindow({ sender: window, senderFrame: top }, windows)).toBe(true);
    expect(fromAppWindow({ sender: window, senderFrame: { url: 'app://code-learn/index.html' } }, windows)).toBe(false);
    const other = { mainFrame: { url: 'app://code-learn/index.html' } };
    expect(fromAppWindow({ sender: other, senderFrame: other.mainFrame }, windows)).toBe(false);
    const navigated = { mainFrame: { url: 'https://example.com/' } };
    expect(fromAppWindow({ sender: navigated, senderFrame: navigated.mainFrame }, new Set([navigated]))).toBe(false);
    expect(fromAppWindow({ sender: window, senderFrame: null }, windows)).toBe(false);
  });

  it("is the spec's CSP, with no inline styles", () => {
    expect(CSP).toBe("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
  });
});
