// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SyncResult } from '../shared/api';
import { desktopState } from './state';
import type { SyncRepo } from './sync';
import { syncService } from './syncService';
import { tempDir } from './testing/temp';

const synced: SyncResult = { state: 'synced', at: '2026-11-10T12:00:00.000Z', clashes: [] };

/** gh signed in as `me`, with one private and one public repository, and a sync that records where it went. */
function service({ gh = '/usr/bin/gh' as string | null, signedIn = true, pending = false } = {}) {
  const state = desktopState(tempDir('code-learn-state-'));
  const ghCalls: string[][] = [];
  const syncs: { target: SyncRepo; networkMs?: number }[] = [];
  let forgotten = 0;
  const runGh = async (_gh: string, args: string[]) => {
    ghCalls.push(args);
    const key = args.slice(0, 2).join(' ');
    if (key === 'auth status') return { code: signedIn ? 0 : 1, stdout: '' };
    if (key === 'api user') return { code: 0, stdout: 'me\n' };
    if (key === 'repo list') return { code: 0, stdout: JSON.stringify([{ nameWithOwner: 'me/code-learn-sync', visibility: 'PRIVATE' }, { nameWithOwner: 'me/site', visibility: 'PUBLIC' }]) };
    if (key === 'repo view') return { code: 0, stdout: args[2] === 'me/site' ? 'PUBLIC\n' : 'PRIVATE\n' };
    if (key === 'repo create') return { code: 0, stdout: '' };
    return { code: 1, stdout: '' };
  };
  const s = syncService({
    state,
    gh: () => gh,
    runGh,
    sync: {
      syncNow: async (target, networkMs) => (syncs.push({ target, networkMs }), synced),
      pending: async () => pending,
      forget: () => void forgotten++,
    },
  });
  return { s, state, ghCalls, syncs, forgotten: () => forgotten };
}

describe('GitHub sync settings', () => {
  it("tells whether gh is missing, signed out or signed in, and as whom", async () => {
    expect((await service({ gh: null }).s.api.syncView()).gh).toEqual({ state: 'missing' });
    expect((await service({ signedIn: false }).s.api.syncView()).gh).toEqual({ state: 'signed-out' });
    expect(await service().s.api.syncView()).toEqual({ gh: { state: 'ready', login: 'me' }, running: false });
  });

  it("lists the learner's repositories, saying which are private", async () => {
    expect(await service().s.api.githubRepos()).toEqual([{ name: 'me/code-learn-sync', private: true }, { name: 'me/site', private: false }]);
  });

  it('syncs with a private repository through gh, remembers it, and refuses a public one', async () => {
    const t = service();
    await expect(t.s.api.connectSync({ via: 'gh', name: 'me/site' })).rejects.toThrow(/public/);
    const view = await t.s.api.connectSync({ via: 'gh', name: 'me/code-learn-sync' });
    expect(view).toMatchObject({ repo: { name: 'me/code-learn-sync', via: 'gh' }, last: synced, running: false });
    expect(t.syncs[0].target).toEqual({ remote: 'https://github.com/me/code-learn-sync.git', gh: '/usr/bin/gh' });
    expect(t.state.read().sync).toMatchObject({ via: 'gh', name: 'me/code-learn-sync', last: synced });
  });

  it('creates a private repository through gh and syncs with it', async () => {
    const t = service();
    const view = await t.s.api.createGithubRepo('code-learn-sync');
    expect(t.ghCalls).toContainEqual(['repo', 'create', 'code-learn-sync', '--private']);
    expect(view.repo).toEqual({ name: 'me/code-learn-sync', via: 'gh' });
    await expect(t.s.api.createGithubRepo('bad name; rm')).rejects.toThrow(/name/);
  });

  it('syncs with an address git signs in to by itself, and refuses one that is not a repository address', async () => {
    const t = service({ gh: null });
    await t.s.api.connectSync({ via: 'git', remote: 'git@github.com:me/code-learn-sync.git' });
    expect(t.syncs[0].target).toEqual({ remote: 'git@github.com:me/code-learn-sync.git' });
    await expect(t.s.api.connectSync({ via: 'git', remote: '--upload-pack=touch /tmp/x' })).rejects.toThrow(/address/);
  });

  it('stops syncing on disconnect, and forgets its copy', async () => {
    const t = service();
    await t.s.api.connectSync({ via: 'gh', name: 'me/code-learn-sync' });
    const before = t.forgotten();
    expect((await t.s.api.disconnectSync()).repo).toBeUndefined();
    expect(t.state.read().sync).toBeUndefined();
    expect(t.forgotten()).toBe(before + 1);
    await expect(t.s.api.syncNow()).rejects.toThrow(/isn't syncing/);
  });

  it('sends what is pending before quitting, within 10 seconds, and nothing when all is sent', async () => {
    const idle = service();
    await idle.s.api.connectSync({ via: 'gh', name: 'me/code-learn-sync' });
    await idle.s.beforeQuit();
    expect(idle.syncs).toHaveLength(1);
    const busy = service({ pending: true });
    await busy.s.api.connectSync({ via: 'gh', name: 'me/code-learn-sync' });
    await busy.s.beforeQuit();
    expect(busy.syncs[1].networkMs).toBe(10_000);
  });
});
