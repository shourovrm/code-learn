// GitHub sync (DESIGN "Sync"): the learner's courses, progress, notes and code go to their own private repository, so
// every computer they use has the same. Git runs in a staging clone in code-learn's own folder, never in the
// workspace: an agent can write the workspace, and a .git it wrote could make git run its code on the host. Core
// copies files out and back, each under its lock. Git runs with an argument array, no hooks and no prompts.
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SyncResult, SyncState } from '../shared/api';
import type { CoreApp, CoreSyncChange } from './core/types';

/** The repository: its address, and gh's path when git signs in through the GitHub CLI. */
export interface SyncRepo {
  remote: string;
  gh?: string;
}

export interface SyncDeps {
  git: string;
  /** code-learn's sync folder (userData/sync); the staging clone is its `repo`. */
  dir: string;
  ws: string;
  /** This computer's name, which the other computer's clash copies carry ("main.c.from-desk"). */
  machine: string;
  core: Pick<CoreApp, 'exportForSync' | 'importFromSync' | 'mergeLog' | 'mergeNotes'>;
}

const OFFLINE = /could not resolve host|unable to access|network is unreachable|timed out|connection refused|temporary failure in name resolution|no route to host/i;
const SIGNED_OUT = /authentication failed|permission denied \(publickey\)|could not read username|terminal prompts disabled|repository not found|403/i;
const NETWORK_MS = 60_000;

class GitError extends Error {
  constructor(readonly output: string) {
    super(output.split('\n').filter(Boolean).slice(-3).join('\n'));
  }
}

const NOTES = /^home\/courses\/[^/]+\/lessons\/[^/]+\/notes\.md$/;

export function createSync({ git, dir, ws, machine, core }: SyncDeps) {
  const repo = join(dir, 'repo');
  // One sync at a time: a push on close waits for the one running.
  let last: Promise<unknown> = Promise.resolve();

  function run(args: string[], { repoOf, timeoutMs = 30_000, check = true }: { repoOf?: SyncRepo; timeoutMs?: number; check?: boolean } = {}) {
    const signIn = repoOf?.gh ? ['-c', 'credential.helper=', '-c', `credential.helper=!'${repoOf.gh}' auth git-credential`] : [];
    const safe = ['-C', repo, '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', `user.name=${machine}`, '-c', 'user.email=code-learn@localhost', ...signIn];
    return new Promise<{ code: number; stdout: string }>((resolve, reject) => {
      execFile(git, [...safe, ...args], {
        timeout: timeoutMs, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8',
        // No prompt can wait for an answer nobody gives: git fails instead, and Settings says why.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes', LC_ALL: 'C' },
      }, (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
        if (code !== 0 && check) reject(new GitError(`${stderr}\n${error?.killed ? 'timed out' : ''}`));
        else resolve({ code, stdout });
      });
    });
  }

  const show = async (spec: string) => {
    const { code, stdout } = await run(['show', spec], { check: false });
    return code === 0 ? stdout : undefined;
  };
  const head = async () => {
    const { code, stdout } = await run(['rev-parse', '--verify', '-q', 'HEAD'], { check: false });
    return code === 0 ? stdout.trim() : undefined;
  };
  const list = (stdout: string) => stdout.split('\0').filter(Boolean);

  /** The staging clone, made once, pointing at the repository. */
  async function prepare(target: SyncRepo) {
    mkdirSync(repo, { recursive: true });
    await run(['init', '-q', '-b', 'main']);
    // set-url, not remove and add: removing a remote also drops what was last fetched from it.
    const known = (await run(['remote', 'get-url', 'origin'], { check: false })).code === 0;
    await run(['remote', known ? 'set-url' : 'add', 'origin', target.remote]);
  }

  /** Copies this computer's files in and commits them; deleted files become deletions. */
  async function commitLocal() {
    rmSync(join(repo, 'home'), { recursive: true, force: true });
    rmSync(join(repo, 'workspace'), { recursive: true, force: true });
    await core.exportForSync(ws, repo);
    await run(['add', '-A']);
    const { stdout } = await run(['status', '--porcelain']);
    if (stdout.trim() !== '') await run(['commit', '-q', '-m', `Sync from ${machine}`]);
  }

  /** Settles one file both computers changed (DESIGN "Sync"), and says whether it was a clash worth telling. */
  async function settle(path: string, theirMachine: string, oursNewer: boolean): Promise<boolean> {
    const [base, ours, theirs] = [await show(`:1:${path}`), await show(`:2:${path}`), await show(`:3:${path}`)];
    const write = (rel: string, text: string) => {
      mkdirSync(dirname(join(repo, rel)), { recursive: true });
      writeFileSync(join(repo, rel), text);
    };
    let clash = false;
    // Changed on one side, deleted on the other: the change stays.
    if (ours === undefined || theirs === undefined) write(path, (ours ?? theirs)!);
    else if (path.endsWith('/events.jsonl')) write(path, core.mergeLog(base ?? '', ours, theirs));
    else if (NOTES.test(path)) write(path, core.mergeNotes(ours, theirs, theirMachine));
    else if (path.startsWith('workspace/exercises/')) {
      // The learner's code: this computer's stays, the other's is kept beside it.
      write(path, ours);
      write(`${path}.from-${theirMachine}`, theirs);
      await run(['add', '--', `${path}.from-${theirMachine}`]);
      clash = true;
    } else write(path, oursNewer ? ours : theirs);
    await run(['add', '--', path]);
    return clash;
  }

  /** Merges the repository's work into this computer's, settling every clash. */
  async function merge(target: SyncRepo): Promise<string[]> {
    const { code } = await run(['merge', '-q', '--no-edit', '--allow-unrelated-histories', 'origin/main'], { repoOf: target, check: false });
    if (code === 0) return [];
    const conflicted = list((await run(['diff', '--name-only', '-z', '--diff-filter=U'])).stdout);
    if (conflicted.length === 0) throw new GitError('git could not merge the repository.');
    const theirMachine = (await run(['log', '-1', '--format=%an', 'MERGE_HEAD'])).stdout.trim().replace(/[^A-Za-z0-9._-]/g, '-') || 'other';
    const time = async (ref: string) => Number((await run(['log', '-1', '--format=%ct', ref])).stdout.trim());
    const oursNewer = (await time('HEAD')) >= (await time('MERGE_HEAD'));
    const clashes: string[] = [];
    for (const path of conflicted) if (await settle(path, theirMachine, oursNewer)) clashes.push(path);
    await run(['commit', '-q', '--no-edit']);
    return clashes;
  }

  /** What the merge changed here, for core to write: each file's new text, or its deletion. */
  async function changesSince(before: string | undefined): Promise<CoreSyncChange[]> {
    const after = await head();
    if (!after || before === after) return [];
    if (!before) return Promise.all(list((await run(['ls-tree', '-r', '--name-only', '-z', after])).stdout).map(async (path) => ({ path, text: await show(`${after}:${path}`) })));
    const fields = list((await run(['diff', '--name-status', '-z', '--no-renames', before, after])).stdout);
    const changes: CoreSyncChange[] = [];
    for (let i = 0; i < fields.length; i += 2) {
      const [status, path] = [fields[i], fields[i + 1]];
      if (status === 'D') changes.push({ path });
      else changes.push({ path, text: await show(`${after}:${path}`), ...(path.endsWith('/events.jsonl') ? { was: await show(`${before}:${path}`) } : {}) });
    }
    return changes;
  }

  async function syncOnce(target: SyncRepo, networkMs: number): Promise<SyncResult> {
    const at = () => new Date().toISOString();
    try {
      await prepare(target);
      await commitLocal();
      await run(['fetch', '-q', 'origin'], { repoOf: target, timeoutMs: networkMs });
      const before = await head();
      const remote = (await run(['rev-parse', '--verify', '-q', 'origin/main'], { check: false })).code === 0;
      const clashes = remote ? await merge(target) : [];
      if (await head()) await run(['push', '-q', 'origin', 'HEAD:main'], { repoOf: target, timeoutMs: networkMs });
      await core.importFromSync(ws, await changesSince(before));
      return { state: 'synced', at: at(), clashes };
    } catch (e) {
      const output = e instanceof GitError ? e.output : String(e);
      // A merge left half-done is undone, so the next sync starts clean; this computer's files were never touched.
      await run(['merge', '--abort'], { check: false });
      const state: SyncState = OFFLINE.test(output) ? 'offline' : SIGNED_OUT.test(output) ? 'signed-out' : 'failed';
      return { state, at: at(), clashes: [], detail: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    dir,
    /** Sends this computer's work, brings in the other computers', and settles clashes. Never throws. */
    syncNow(target: SyncRepo, networkMs = NETWORK_MS): Promise<SyncResult> {
      const turn = last.then(() => syncOnce(target, networkMs));
      last = turn.catch(() => undefined);
      return turn;
    },
    /** Whether this computer has work the repository doesn't have yet: changed files, or commits not sent. */
    async pending(target: SyncRepo): Promise<boolean> {
      const turn = last.then(async () => {
        await prepare(target);
        await commitLocal();
        const remote = (await run(['rev-parse', '--verify', '-q', 'origin/main'], { check: false })).code === 0;
        if (!remote) return (await head()) !== undefined;
        return (await run(['rev-list', '--count', 'origin/main..HEAD'])).stdout.trim() !== '0';
      });
      last = turn.catch(() => undefined);
      return turn;
    },
    /** Forgets the staging clone. The repository on GitHub and this computer's files stay as they are. */
    forget(): void {
      rmSync(repo, { recursive: true, force: true });
    },
  };
}
