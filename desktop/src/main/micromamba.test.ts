import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { micromambaIn } from './micromamba';

describe('the bundled micromamba', () => {
  it('is the binary in its folder when it is there', () => {
    const binary = join('/app/micromamba', 'micromamba');
    expect(micromambaIn('/app/micromamba', (file) => file === binary)).toBe(binary);
  });

  it('is none when the folder has no binary, so core falls back to PATH', () => {
    expect(micromambaIn('/app/micromamba', () => false)).toBeUndefined();
  });
});
