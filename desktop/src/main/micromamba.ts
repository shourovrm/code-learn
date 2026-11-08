// The micromamba this app bundles for installing track toolchains (core DESIGN §4.6): packaging ships this chip's copy
// in <resources>/micromamba; in development it is vendor/micromamba/linux-<arch>.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The micromamba in `dir`, or none when it isn't there (core then looks for one on PATH). */
export function micromambaIn(dir: string, exists: (file: string) => boolean = existsSync): string | undefined {
  const file = join(dir, 'micromamba');
  return exists(file) ? file : undefined;
}
