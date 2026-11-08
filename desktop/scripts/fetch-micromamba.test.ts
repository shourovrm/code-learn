import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ASSET, fetchMicromamba } from './fetch-micromamba.mjs';

const out = () => join(mkdtempSync(join(tmpdir(), 'code-learn-micromamba-')), 'linux-x64');
const bytes = Buffer.from('#!/bin/sh\necho fake micromamba\n');
const asset = { ...ASSET, sha256: createHash('sha256').update(bytes).digest('hex') };

describe('fetchMicromamba', () => {
  it('pins micromamba 2 from the micromamba-releases project by SHA-256', () => {
    expect(ASSET.url).toMatch(/^https:\/\/github\.com\/mamba-org\/micromamba-releases\/releases\/download\/2\.\d+\.\d+-\d+\/micromamba-linux-64$/);
    expect(ASSET.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes an executable binary, its notice and the pinned digest', async () => {
    const dir = out();
    await fetchMicromamba({ out: dir, asset, get: async () => bytes });
    expect(readFileSync(join(dir, 'micromamba'))).toEqual(bytes);
    expect(statSync(join(dir, 'micromamba')).mode & 0o111).toBe(0o111);
    expect(readFileSync(join(dir, 'NOTICE'), 'utf8')).toContain('BSD-3-Clause');
    expect(readFileSync(join(dir, 'micromamba.sha256'), 'utf8')).toBe(asset.sha256);
  });

  it('refuses a download whose digest differs, and writes nothing', async () => {
    const dir = out();
    await expect(fetchMicromamba({ out: dir, asset, get: async () => Buffer.from('tampered') })).rejects.toThrow(/should have SHA-256/);
    expect(existsSync(join(dir, 'micromamba'))).toBe(false);
  });

  it("doesn't download again when the pinned binary is there", async () => {
    const dir = out();
    await fetchMicromamba({ out: dir, asset, get: async () => bytes });
    await fetchMicromamba({ out: dir, asset, get: async () => { throw new Error('downloaded again'); } });
  });
});
