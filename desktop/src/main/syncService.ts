// GitHub sync's settings and timing (DESIGN "Sync"): which repository, through gh or plain git, and when to sync:
// at start, a minute after a change, and before quitting. code-learn asks gh only whether it is signed in, as whom,
// and about repositories; it never reads gh's or git's credentials.
import type { SyncResult, SyncTarget, SyncView } from '../shared/api';
import type { desktopState } from './state';
import type { SyncRepo } from './sync';

export interface SyncServiceDeps {
  state: ReturnType<typeof desktopState>;
  /** gh's path, or null when it isn't installed. */
  gh: () => string | null;
  runGh: (gh: string, args: string[]) => Promise<{ code: number; stdout: string }>;
  sync: {
    syncNow(target: SyncRepo, networkMs?: number): Promise<SyncResult>;
    pending(target: SyncRepo): Promise<boolean>;
    forget(): void;
  };
}

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const OWNER_REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
// https, ssh:// or scp-like (git@host:path) addresses only: nothing git could read as an option.
const ADDRESS = /^(https:\/\/[^\s]+|ssh:\/\/[^\s]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+)$/;
const QUIT_MS = 10_000;
const EVERY_MS = 60_000;

export function syncService({ state, gh, runGh, sync }: SyncServiceDeps) {
  let running = false;

  const saved = () => state.read().sync;

  function target(): SyncRepo | undefined {
    const repo = saved();
    if (!repo) return undefined;
    const ghPath = repo.via === 'gh' ? gh() : null;
    return { remote: repo.remote, ...(ghPath ? { gh: ghPath } : {}) };
  }

  async function ghCall(args: string[]): Promise<string> {
    const path = gh();
    if (!path) throw new Error("The GitHub CLI (gh) isn't installed.");
    const { code, stdout } = await runGh(path, args);
    if (code !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')} didn't work. Run gh auth status in a terminal to check it.`);
    return stdout.trim();
  }

  async function ghState(): Promise<SyncView['gh']> {
    const path = gh();
    if (!path) return { state: 'missing' };
    if ((await runGh(path, ['auth', 'status', '--hostname', 'github.com'])).code !== 0) return { state: 'signed-out' };
    return { state: 'ready', login: await ghCall(['api', 'user', '--jq', '.login']) };
  }

  async function view(): Promise<SyncView> {
    const repo = saved();
    return {
      gh: await ghState(),
      ...(repo ? { repo: { name: repo.name, via: repo.via }, ...(repo.last ? { last: repo.last } : {}) } : {}),
      running,
    };
  }

  async function syncOnce(networkMs?: number): Promise<SyncResult> {
    const to = target();
    if (!to) throw new Error("code-learn isn't syncing with GitHub. Connect a repository in Settings.");
    running = true;
    try {
      const last = await sync.syncNow(to, networkMs);
      state.update((s) => (s.sync ? { ...s, sync: { ...s.sync, last } } : s));
      return last;
    } finally {
      running = false;
    }
  }

  async function connect(via: 'gh' | 'git', name: string, remote: string): Promise<SyncView> {
    sync.forget();
    state.update((s) => ({ ...s, sync: { via, name, remote } }));
    await syncOnce();
    return view();
  }

  const api = {
    syncView: view,
    async githubRepos() {
      const list = JSON.parse(await ghCall(['repo', 'list', '--limit', '200', '--json', 'nameWithOwner,visibility'])) as { nameWithOwner: string; visibility: string }[];
      return list.map((r) => ({ name: r.nameWithOwner, private: r.visibility === 'PRIVATE' }));
    },
    async createGithubRepo(name: string) {
      if (!REPO_NAME.test(name)) throw new Error('A repository name has only letters, digits, dots, dashes and underscores.');
      await ghCall(['repo', 'create', name, '--private']);
      const login = await ghCall(['api', 'user', '--jq', '.login']);
      return connect('gh', `${login}/${name}`, `https://github.com/${login}/${name}.git`);
    },
    async connectSync(to: SyncTarget) {
      if (to.via === 'git') {
        if (!ADDRESS.test(to.remote)) throw new Error('That isn’t a repository address. Use one like git@github.com:you/code-learn-sync.git.');
        return connect('git', to.remote, to.remote);
      }
      if (!OWNER_REPO.test(to.name)) throw new Error('Choose a repository as owner/name.');
      // Exercises carry their hidden tests and solutions, so only a private repository will do.
      const visibility = await ghCall(['repo', 'view', to.name, '--json', 'visibility', '--jq', '.visibility']);
      if (visibility !== 'PRIVATE') throw new Error(`${to.name} is public. Sync only uses a private repository, since exercises hold their hidden tests.`);
      return connect('gh', to.name, `https://github.com/${to.name}.git`);
    },
    async syncNow() {
      await syncOnce();
      return view();
    },
    async disconnectSync() {
      state.update((s) => ({ ...s, sync: undefined }));
      sync.forget();
      return view();
    },
  };

  return {
    api,
    /** Syncs now if connected, then every minute in which something changed. */
    start() {
      if (target()) void syncOnce().catch(() => undefined);
      const timer = setInterval(() => {
        const to = target();
        if (!to || running) return;
        void sync.pending(to).then((pending) => (pending ? syncOnce() : undefined)).catch(() => undefined);
      }, EVERY_MS);
      timer.unref();
    },
    /** Before quitting: sends what GitHub doesn't have yet, giving up after 10 seconds offline. */
    async beforeQuit(): Promise<void> {
      const to = target();
      if (!to || !(await sync.pending(to))) return;
      await syncOnce(QUIT_MS);
    },
  };
}
