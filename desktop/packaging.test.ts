import { describe, expect, it } from 'vitest';
import { packaging } from './packaging.cjs';

describe('packaging', () => {
  const config = packaging({});

  it('builds an AppImage for x64 Linux, and nothing else', () => {
    expect(config.linux.target).toEqual([{ target: 'AppImage', arch: ['x64'] }]);
    expect(config).not.toHaveProperty('pacman');
    expect(config).not.toHaveProperty('mac');
    expect(config).not.toHaveProperty('win');
  });

  it('publishes nothing and says the build is unsigned, so the app offers no updates', () => {
    expect(config.publish).toBeNull();
    expect(config.extraMetadata).toEqual({ codeLearn: { signed: false } });
  });

  it('ships the pinned micromamba and its notice outside the archive', () => {
    expect(config.extraResources).toContainEqual({ from: 'vendor/micromamba/linux-x64', to: 'micromamba', filter: ['micromamba', 'NOTICE'] });
  });

  it('leaves the development mock and its demo curriculum out of the installer', () => {
    expect(config.files).toContain('!out/main/mock.js');
  });

  it('carries the licenses of the fonts and of everything the renderer bundles, outside the archive', () => {
    const from = (config.extraResources as { from: string }[]).map((r) => r.from);
    expect(from).toContain('src/renderer/assets/fonts');
    // vite.config.mts writes them to out/renderer/licenses.md (build.license).
    expect(from).toContain('out/renderer/licenses.md');
  });
});
