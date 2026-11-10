// Builds the live CodeLearnApi (DESIGN §2): the bundled core in-process, agents
// found on this computer, and agent jobs whose MCP server is the
// bundled core run with this app as Node (§2, §7).
import { app, net } from 'electron';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { AGENT_CLIS } from './agent/agents';
import { ask } from './agent/bridge';
import { signedInOf } from './agent/signedIn';
import { find } from './agent/find';
import { livePath, nodeRun } from './agent/livePath';
import { computerCheck } from './computer';
import { agentInstaller, nodeAgentDeps } from './agentInstall';
import { connector } from './connect';
import { electronGet } from './download';
import { nativeArch } from './host';
import type { CoreApp } from './core/types';
import { createLive, type Live } from './live';
import type { Log } from './log';
import { codeLearnServer } from './server';
import { agentSignIn, nodeSignInDeps } from './signIn';
import { desktopState, workspaceOf } from './state';
import { createSync } from './sync';
import { syncService } from './syncService';
import { usageStore } from './usage';
import { micromambaIn } from './micromamba';

export interface Places {
  /** out/core in development, <resources>/core when packaged. */
  coreDir: string;
  /** Where the bundled micromamba is: <resources>/micromamba when packaged, vendor/micromamba/linux-<arch> in development. */
  micromambaDir: string;
  userData: string;
  log: Log;
}

export function liveApi({ coreDir, micromambaDir, userData, log }: Places): Live & { sync: ReturnType<typeof syncService> } {
  // Core installs track toolchains with micromamba, in-process and in the agent's server (server.ts): the bundled
  // one, else core finds one on PATH.
  const micromamba = micromambaIn(micromambaDir);
  if (micromamba) process.env.CODE_LEARN_MICROMAMBA = micromamba;
  // The bundled core (scripts/bundle-core.mjs), loaded in-process.
  const core = require(join(coreDir, 'dist', 'app.cjs')) as CoreApp;
  const state = desktopState(userData);
  const ws = workspaceOf(state.read(), homedir());
  mkdirSync(ws, { recursive: true });
  const runtime = process.execPath;
  // Agent downloads go through Chromium's network stack (the system's proxy and certificates), for this computer's own chip.
  const network = { get: electronGet(net.request), arch: nativeArch(process.arch, app.runningUnderARM64Translation) };

  // Claude Code, Codex and Cursor, installed the vendor's own way into the learner's folders, then their own sign-in.
  const installer = agentInstaller(nodeAgentDeps((bin) => find(bin), network));
  const connect = connector(
    {
      find: (bin) => find(bin),
      signedIn: (id, exe) => signedInOf(id, exe),
      version: (id, exe) => ask(exe, AGENT_CLIS[id].version.args, AGENT_CLIS[id].version.read),
    },
    state,
    { ...installer, signIn: agentSignIn(nodeSignInDeps(runtime)) },
  );

  const computer = computerCheck({
    sandbox: () => core.sandboxDown(),
    isolation: () => core.isolation(),
    // Read when a requirement is missing, to name the package manager's command; a computer without the file gets the
    // general advice.
    osRelease: () => {
      try {
        return readFileSync('/etc/os-release', 'utf8');
      } catch {
        return undefined;
      }
    },
  }, log);

  // GitHub sync (DESIGN "Sync"): git and gh as installed; without git, Settings says the sync failed.
  const sync = syncService({
    state,
    gh: () => find('gh')?.path ?? null,
    runGh,
    sync: createSync({ git: find('git')?.path ?? 'git', dir: join(userData, 'sync'), ws, machine: hostname().replace(/[^A-Za-z0-9._-]/g, '-') || 'computer', core }),
  });

  const live = createLive({
    core,
    connect,
    computer,
    state,
    ws,
    runtime,
    agentDir: join(userData, 'agents'),
    usage: usageStore(userData),
    progressDir: join(userData, 'progress'),
    log,
    server: codeLearnServer({ runtime, coreDir, ws, env: process.env }),
    // On Windows, what installers added to the registry's PATH since code-learn started (§3.1): agents rely on it. A steady clock: one set back would hold off the next read.
    livePath: livePath({ platform: process.platform, env: process.env, run: nodeRun, now: () => performance.now() }),
  });
  return { ...live, ...sync.api, sync };
}

/** Runs gh with an argument array; it never prompts, since nobody would answer. */
function runGh(gh: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(gh, args, { timeout: 30_000, encoding: 'utf8', env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } }, (error, stdout) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : -1) : 0, stdout });
    });
  });
}

