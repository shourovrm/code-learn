// Fetches the micromamba the Linux installers bundle (core DESIGN §4.6): the pinned release asset, checked against its
// SHA-256 before it's written, into vendor/micromamba/linux-x64, which packaging.cjs ships as <resources>/micromamba.
// Run by `npm run dist`; `node scripts/fetch-micromamba.mjs` fetches it for development too.
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * micromamba 2.10.0 (BSD-3-Clause, https://github.com/mamba-org/mamba), from the micromamba-releases project. The
 * SHA-256 is GitHub's digest for the release asset.
 */
export const ASSET = {
  version: '2.10.0',
  url: 'https://github.com/mamba-org/micromamba-releases/releases/download/2.10.0-0/micromamba-linux-64',
  sha256: '701f39c06f8e6a670a0e186c8479b9e5c0502a2f0cda6cef65d83bdd2875e8bd',
};

/** Shipped beside the binary, which carries no license file of its own. */
const NOTICE = `micromamba ${ASSET.version}
Copyright (c) 2019, QuantStack and the mamba contributors. BSD-3-Clause license.
Source and full license: https://github.com/mamba-org/mamba
Binary: ${ASSET.url}
`;

const MAX_BYTES = 64 * 2 ** 20;

/** Downloads over https only, redirects included, at most 64 MB, counted as it arrives. */
async function httpsGet(/** @type {string} */ url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.url.startsWith('https://') || !res.body) throw new Error(`Couldn't download ${url}: ${res.status} from ${res.url}`);
  const tooBig = new Error(`${url} is over ${MAX_BYTES} bytes.`);
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw tooBig;
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw tooBig;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Puts micromamba and its NOTICE in `out`, unless the pinned one is already there (`out/micromamba.sha256`).
 * @param {{ out: string, asset?: typeof ASSET, get?: (url: string) => Promise<Buffer> }} options
 */
export async function fetchMicromamba({ out, asset = ASSET, get = httpsGet }) {
  const binary = join(out, 'micromamba');
  const marker = join(out, 'micromamba.sha256');
  if (existsSync(binary) && existsSync(marker) && readFileSync(marker, 'utf8') === asset.sha256) return;
  const bytes = await get(asset.url);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== asset.sha256) throw new Error(`${asset.url} should have SHA-256 ${asset.sha256}, but has ${digest}.`);
  mkdirSync(out, { recursive: true });
  // Written beside its final name, then renamed, so a half-written binary is never the one shipped.
  const partial = `${binary}.partial`;
  writeFileSync(partial, bytes);
  chmodSync(partial, 0o755);
  renameSync(partial, binary);
  writeFileSync(join(out, 'NOTICE'), NOTICE);
  writeFileSync(marker, asset.sha256);
}

// Run as a script, also from a checkout reached through a symlink (import.meta.url is the real path).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await fetchMicromamba({ out: join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'micromamba', 'linux-x64') });
}
