// This computer, as the agent installer uses it: downloads through the app's network, the disk, and processes run
// from argument arrays, never a shell. Tests pass fakes instead.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statfsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloader, type Get } from './download';

export interface HostDeps {
  platform: NodeJS.Platform;
  /** This computer's own chip (nativeArch), not the one this build of code-learn emulates. */
  arch: string;
  /** %ProgramFiles% and %LOCALAPPDATA% on Windows, where agents install for all users and for one. */
  programFiles?: string;
  localAppData?: string;
  home?: string;
  tempDir(): string;
  freeBytes(dir: string): Promise<number>;
  /**
   * Saves `url` to `file`, reporting 0 to 1, if every hop is on an `allowed` host, at most `maxBytes`.
   * Rejects with OfflineError when this computer can't reach it.
   */
  download(url: string, file: string, progress: (fraction: number) => void, allowed: (url: string) => boolean, maxBytes?: number): Promise<void>;
  /**
   * Runs a program to its end, or until `timeoutMs` (then `code` is null). `failedToStart`: the system's error when it
   * couldn't start.
   */
  run(file: string, args: string[], opts?: { env?: Record<string, string>; timeoutMs?: number }): Promise<{ code: number | null; output: string; failedToStart?: string }>;
  /** Starts a program without waiting for it; rejects if it can't start. */
  launch(file: string, args: string[]): Promise<void>;
  exists(path: string): boolean;
  remove(path: string): void;
  now(): number;
}

/** The chip to download for: an x64 build running under Arm translation is on an arm64 computer. */
export const nativeArch = (arch: string, translated: boolean) => (translated ? 'arm64' : arch);

/** The network to download through: Electron's in the app (electronGet), and this computer's own chip (nativeArch). */
export interface Network {
  get: Get;
  arch: string;
}

/** The real computer: the network given, the disk, and argument-array processes. */
export function nodeHostDeps({ get, arch }: Network): HostDeps {
  const download = downloader(get);
  return {
    platform: process.platform,
    arch,
    programFiles: process.env.ProgramFiles,
    localAppData: process.env.LOCALAPPDATA,
    home: homedir(),
    tempDir: () => mkdtempSync(join(tmpdir(), 'code-learn-download-')),
    freeBytes: async (dir) => {
      const s = statfsSync(dir);
      return s.bavail * s.bsize;
    },
    download: (url, file, progress, allowed, maxBytes) => download(url, file, progress, allowed, maxBytes),
    run: (file, args, opts) =>
      new Promise((resolve) => {
        const child = spawn(file, args, { env: { ...process.env, ...opts?.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let output = '';
        let settled = false;
        const finish = (code: number | null, failedToStart?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ code, output, ...(failedToStart ? { failedToStart } : {}) });
        };
        const keep = (b: Buffer) => (output = (output + b.toString()).slice(-65_536));
        child.stdout.on('data', keep);
        child.stderr.on('data', keep);
        // A timeout is a failure at once, even if the program ignores being stopped.
        const timer = setTimeout(() => {
          child.kill();
          finish(null);
        }, opts?.timeoutMs ?? 120_000);
        child.on('error', (e: NodeJS.ErrnoException) => finish(null, e.code ?? 'error'));
        child.on('close', (code) => finish(code));
      }),
    launch: (file, args) =>
      new Promise((resolve, reject) => {
        const child = spawn(file, args, { detached: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      }),
    exists: existsSync,
    remove: (path) => rmSync(path, { recursive: true, force: true }),
    now: () => Date.now(),
  };
}
