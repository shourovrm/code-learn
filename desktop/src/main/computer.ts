// "Check this computer" (DESIGN §6.1, core §4.6): the sandbox's requirements (bubblewrap and the systemd user
// session), then core doctor's isolation self-test from inside a sandbox. Only the first failing row is a problem;
// the one after it waits.
import type { CheckId, Computer, ComputerCheck } from '../shared/api';
import { noLog, type Log } from './log';

export interface Probe {
  /** Core's sandboxDown: undefined when sandboxes work here, otherwise core's code and message. */
  sandbox(): Promise<{ code: string; message: string } | undefined>;
  /** Core doctor's isolation self-test. */
  isolation(): Promise<{ ok: boolean; detail: string }>;
  /** The text of /etc/os-release, or undefined when it can't be read. */
  osRelease(): string | undefined;
}

/** The package managers whose bubblewrap package code-learn knows, by the distribution ids os-release names. */
const INSTALL_COMMANDS: [ids: string[], command: string][] = [
  [['arch', 'cachyos', 'manjaro', 'endeavouros'], 'sudo pacman -S bubblewrap'],
  [['debian', 'ubuntu', 'linuxmint', 'pop'], 'sudo apt install bubblewrap'],
  [['fedora', 'rhel', 'centos'], 'sudo dnf install bubblewrap'],
  [['opensuse', 'suse', 'opensuse-tumbleweed', 'opensuse-leap'], 'sudo zypper install bubblewrap'],
];

/**
 * The command that installs bubblewrap on this distribution, from os-release's ID and then its ID_LIKE list, or
 * undefined for a distribution code-learn doesn't know.
 */
export function installCommand(osRelease: string | undefined): string | undefined {
  if (!osRelease) return undefined;
  const field = (name: string) => new RegExp(`^${name}=(.*)$`, 'm').exec(osRelease)?.[1]?.replace(/^["']|["']$/g, '').toLowerCase() ?? '';
  const ids = [field('ID'), ...field('ID_LIKE').split(/\s+/)].filter(Boolean);
  for (const id of ids) {
    const known = INSTALL_COMMANDS.find(([names]) => names.includes(id));
    if (known) return known[1];
  }
  return undefined;
}

/** A re-checkable check: it remembers a self-test that passed, since nothing a learner does can undo it. */
export function computerCheck(probe: Probe, log: Log = noLog): () => Promise<Computer> {
  let isolationOk = false;
  let lastReason: string | undefined;

  async function failing(): Promise<{ at: number; reason: string; installCommand?: string } | null> {
    const down = await probe.sandbox();
    if (down) {
      const command = down.code === 'no-sandbox' ? installCommand(probe.osRelease()) : undefined;
      return { at: 0, reason: down.message, ...(command ? { installCommand: command } : {}) };
    }
    if (isolationOk) return null;
    const self = await probe.isolation();
    isolationOk = self.ok;
    if (self.ok) return null;
    return { at: 1, reason: self.detail };
  }

  return async () => {
    const problem = await failing();
    // Logged when the reason changes, not on every re-check.
    if (problem && problem.reason !== lastReason) log('computer', { reason: problem.reason });
    lastReason = problem?.reason;
    const ids: CheckId[] = ['sandbox', 'isolation'];
    const checks = ids.map((id, i): ComputerCheck => {
      if (!problem || i < problem.at) return { id, state: 'ok' };
      if (i > problem.at) return { id, state: 'waiting' };
      return { id, state: 'problem', reason: problem.reason, ...(problem.installCommand ? { installCommand: problem.installCommand } : {}) };
    });
    return { checks, ready: !problem };
  };
}
