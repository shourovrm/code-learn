// Settings (DESIGN "Sync"): the agent, GitHub sync and the theme. The gear in the sidebar opens it.
import { useState } from 'react';
import type { Agent, SyncResult, SyncTarget, SyncView } from '../../../shared/api';
import { useApi } from '../../app/api';
import { noteSync } from '../../app/CloseGuard';
import { problemOf, sayOf } from '../../app/errors';
import { useRouter } from '../../app/router';
import { TextSizeSwitch } from '../../app/TextSizeControls';
import { ThemeSwitch } from '../../app/ThemeSwitch';
import { useLoad } from '../../app/useLoad';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ModelRows } from '../connect/ModelRows';

export function Settings() {
  return (
    <main className="main page settings">
      <h1 className="h2 a-up" tabIndex={-1}>Settings</h1>
      <p className="sub">Your agent, syncing with GitHub, and how code-learn looks.</p>
      <AgentSection />
      <SyncSection />
      <section className="card settings-card" aria-labelledby="theme-title">
        <h2 className="h3" id="theme-title">Theme</h2>
        <ThemeSwitch />
      </section>
      <section className="card settings-card" aria-labelledby="text-size-title">
        <h2 className="h3" id="text-size-title">Text size</h2>
        <p className="quiet-text">Starting size. Ctrl+= / Ctrl+- or A− / A+ change it; Ctrl+0 resets.</p>
        <TextSizeSwitch />
      </section>
    </main>
  );
}

function AgentSection() {
  const api = useApi();
  const { go } = useRouter();
  const { data: agents } = useLoad(() => api.agents(), []);
  // The agent as it is after a model choice, until the list is read again.
  const [chosen, setChosen] = useState<Agent>();
  const connected = chosen ?? agents?.find((a) => a.state === 'connected');
  return (
    <section className="card settings-card" aria-labelledby="agent-title">
      <h2 className="h3" id="agent-title"><Icon name="plug" size={18} />Agent</h2>
      <div className="settings-row">
        <p className="fill">
          {connected ? <><b>{connected.name}</b> <span className="quiet-text">· Connected</span></> : <span className="quiet-text">No agent connected.</span>}
          <br /><span className="quiet-text">It writes your lessons and exercises, and answers in the tutor.</span>
        </p>
        <Button variant="ghost" onClick={() => go({ to: 'connect', then: { to: 'settings' } })}>Change agent</Button>
      </div>
      {connected && connected.models.length > 1 && (
        <div className="settings-models">
          <h3 className="models-title">Model for each job</h3>
          <ModelRows agent={connected} onChange={setChosen} />
        </div>
      )}
    </section>
  );
}

/** What the last sync did, in words. */
function lastLine(last: SyncResult): string {
  const at = new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (last.state === 'synced') return `Synced at ${at}.`;
  if (last.state === 'offline') return `Couldn't reach GitHub at ${at}. code-learn tries again in a minute, and the next time it opens.`;
  if (last.state === 'signed-out') return "git couldn't sign in to GitHub. Set up an SSH key or a saved login for git, or use the GitHub CLI.";
  return `The last sync failed: ${last.detail ?? 'git stopped'}.`;
}

function SyncSection() {
  const api = useApi();
  const { data, error, reload } = useLoad(async () => {
    const view = await api.syncView();
    noteSync(view);
    return view;
  }, []);
  const [shown, setShown] = useState<SyncView>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const view = shown ?? data;

  async function act(work: () => Promise<SyncView>) {
    setBusy(true);
    setProblem(undefined);
    try {
      const next = await work();
      noteSync(next);
      setShown(next);
    } catch (e) {
      const kind = problemOf(e);
      setProblem(sayOf(e, kind === 'connect' ? 'other' : kind));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card settings-card" aria-labelledby="sync-title">
      <h2 className="h3" id="sync-title">Sync with GitHub</h2>
      {Boolean(error) && <p role="alert">code-learn couldn't load GitHub sync. <Button variant="text" onClick={reload}>Try again</Button></p>}
      {view && (view.repo
        ? <Connected view={view} busy={busy} onSync={() => act(() => api.syncNow())} onDisconnect={() => act(() => api.disconnectSync())} />
        : <Connect view={view} busy={busy} onConnect={(target) => act(() => api.connectSync(target))} onCreate={(name) => act(() => api.createGithubRepo(name))} />)}
      {problem && <p className="settings-problem" role="alert">{problem}</p>}
    </section>
  );
}

function Connected({ view, busy, onSync, onDisconnect }: { view: SyncView; busy: boolean; onSync: () => void; onDisconnect: () => void }) {
  const { repo, last } = view;
  return (
    <>
      <div className="settings-row">
        <p className="fill">
          <b>{repo!.name}</b> <span className="tag">private</span>
          {last && <><br /><span className={last.state === 'synced' ? 'settings-ok' : 'quiet-text'} role="status">{lastLine(last)}</span></>}
        </p>
        <Button variant="ghost" disabled={busy || view.running} onClick={onSync}>{busy || view.running ? 'Syncing…' : 'Sync now'}</Button>
        <Button variant="ghost" disabled={busy} onClick={onDisconnect}>Disconnect</Button>
      </div>
      <p className="quiet-text">It syncs when code-learn opens, a minute after each change, and when you close it. Offline, it tries again later.</p>
      {last && last.clashes.length > 0 && (
        <div className="settings-clash">
          <b>The last sync kept both computers' changes to:</b>
          <ul>{last.clashes.map((path) => <li key={path}><code>{path}</code></li>)}</ul>
          <span className="quiet-text">Your code stayed as it is here; the other computer's version is saved beside it, ending in .from-its-name.</span>
        </div>
      )}
    </>
  );
}

function ghLine(gh: SyncView['gh']): string {
  if (gh.state === 'ready') return `Signed in to gh as ${gh.login}. code-learn can list your repositories and create a private one.`;
  if (gh.state === 'signed-out') return "gh is installed but not signed in. Run gh auth login in a terminal, then come back.";
  return "gh isn't installed. Install the GitHub CLI from cli.github.com and run gh auth login, or use a repository address.";
}

function Connect({ view, busy, onConnect, onCreate }: { view: SyncView; busy: boolean; onConnect: (target: SyncTarget) => void; onCreate: (name: string) => void }) {
  const ready = view.gh.state === 'ready';
  const [way, setWay] = useState<'gh' | 'git'>(ready ? 'gh' : 'git');
  return (
    <>
      <p className="quiet-text">
        Keeps your courses, progress, notes and code the same on every computer you use. It saves to a <b>private</b> GitHub
        repository of yours. Exercises include their hidden tests and solutions, so the repository must stay private.
      </p>
      <div className="settings-ways" role="radiogroup" aria-label="How to reach GitHub">
        <label className={`settings-way${way === 'gh' ? ' on' : ''}`}>
          <input type="radio" name="sync-way" checked={way === 'gh'} disabled={!ready} onChange={() => setWay('gh')} />
          <span><b>Use the GitHub CLI</b><br /><span className="quiet-text">{ghLine(view.gh)}</span></span>
        </label>
        <label className={`settings-way${way === 'git' ? ' on' : ''}`}>
          <input type="radio" name="sync-way" checked={way === 'git'} onChange={() => setWay('git')} />
          <span><b>Use a repository address</b><br /><span className="quiet-text">Create an empty private repository on github.com, then paste its address. git signs in with your SSH key or saved login.</span></span>
        </label>
      </div>
      {way === 'gh' ? <PickRepo busy={busy} onConnect={onConnect} onCreate={onCreate} /> : <AddressForm busy={busy} onConnect={onConnect} />}
    </>
  );
}

const NEW_REPO = 'code-learn-sync';

function PickRepo({ busy, onConnect, onCreate }: { busy: boolean; onConnect: (target: SyncTarget) => void; onCreate: (name: string) => void }) {
  const api = useApi();
  const { data: repos, error } = useLoad(() => api.githubRepos(), []);
  const [picked, setPicked] = useState<string>();
  return (
    <>
      <div className="settings-row">
        <Button disabled={busy} onClick={() => onCreate(NEW_REPO)}>Create a private repository</Button>
        <span className="quiet-text">named <b>{NEW_REPO}</b></span>
      </div>
      {Boolean(error) && <p role="alert">gh couldn't list your repositories. Run gh auth status in a terminal to check it.</p>}
      {repos && repos.length > 0 && (
        <fieldset className="settings-repos">
          <legend className="quiet-text">Or use one you already have:</legend>
          {repos.map((r) => (
            <label key={r.name} className={r.private ? undefined : 'settings-public'}>
              <input type="radio" name="sync-repo" value={r.name} disabled={!r.private} checked={picked === r.name} onChange={() => setPicked(r.name)} />
              {r.name} <span className="tag">{r.private ? 'private' : "public · can't be used"}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="settings-row">
        <span className="fill" />
        <Button disabled={busy || !picked} onClick={() => onConnect({ via: 'gh', name: picked! })}>Connect</Button>
      </div>
    </>
  );
}

function AddressForm({ busy, onConnect }: { busy: boolean; onConnect: (target: SyncTarget) => void }) {
  const [remote, setRemote] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  return (
    <>
      <div className="settings-row">
        <input className="field" aria-label="Repository address" placeholder="git@github.com:you/code-learn-sync.git" value={remote} onChange={(e) => setRemote(e.target.value.trim())} />
        <Button disabled={busy || remote === '' || !isPrivate} onClick={() => onConnect({ via: 'git', remote })}>Connect</Button>
      </div>
      <label className="settings-check">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
        This repository is private. (code-learn can't check without gh.)
      </label>
    </>
  );
}
