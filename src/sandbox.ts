// The sandbox (DESIGN §4.6): every check, Run, install step and self-test runs in bubblewrap, inside its own systemd
// user scope for the memory, process and CPU limits. Nothing else in code-learn runs track or learner code.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, type FSWatcher, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, watch } from "node:fs";
import { join } from "node:path";
import { CodeLearnError, infraError, type InfraCode } from "./errors.js";
import type { ToolchainFolders } from "./judge.js";
import { codeLearnHome, processAlive, writeTextAtomic } from "./store.js";

/** stdout and stderr together, per sandbox, unless the run sets its own cap. */
export const OUTPUT_CAP = 4 * 1024 * 1024;
/** Every scope code-learn starts is named `code-learn-<owner pid>-<random>`, so leftovers can be told apart. */
const SCOPE_PREFIX = "code-learn-";
/** /tmp inside the sandbox, as a judge container's tmpfs was (DESIGN §4.3). */
const TMP_BYTES = 256 * 1024 * 1024;
const DEFAULT_TASKS = 256;
/** How long stopping a scope may take before it counts as failed. */
const STOP_MS = 10_000;
/** How often a starting sandbox's memory events file is looked for, and then read as a backstop to watching it. */
const OOM_POLL_MS = 25;

/** A host folder in the sandbox. Read-only unless `writable` (install steps only). */
export type Mount = { host: string; container: string; writable?: boolean };

export type SandboxRun = {
  /** The program and its arguments, run as process 1 of the sandbox. Never through a host shell. */
  command: string[];
  /** Variables for the command, after the sandbox's own (HOME, PATH, TRACK, LANG). */
  env: Record<string, string>;
  mounts: Mount[];
  memoryMb: number;
  deadlineMs: number;
  /** Keep stdin open for typed input; Run only. */
  stdin?: boolean;
  /** Past this many bytes of stdout and stderr together the run is killed as a flood (default OUTPUT_CAP). */
  outputCap?: number;
  /** Share the host's network and resolver files: install steps only. */
  network?: boolean;
  /** The scope's process limit (default 256). */
  tasks?: number;
  /** The working folder inside the sandbox (default /work/src when it's mounted, else /tmp). */
  cwd?: string;
};

/** `oomKilled`: the kernel killed a process in this sandbox for going over its memory limit. */
export type SandboxResult = { exit: number; stdout: Buffer; stderr: string; flooded: boolean; timedOut: boolean; cleanupFailed: boolean; oomKilled: boolean };

/** The read-only mounts a toolchain gives every sandbox that runs track code. */
export const toolchainMounts = (folders: ToolchainFolders): Mount[] => [
  { host: folders.env, container: "/opt/env" },
  { host: folders.track, container: "/opt/track" },
];

/**
 * How this computer lays out the system folders a sandbox needs. `links` are top-level links into /usr (merged-usr
 * systems) as [target, path]; `dirs` are real folders to mount read-only instead. `generatedEtc` holds the sandbox's
 * own passwd, group and hosts; `networkEtc` the resolver and certificate files an install needs.
 */
export type HostLayout = {
  links: [string, string][]; dirs: string[]; etc: string[]; generatedEtc: string; networkEtc: string[];
  /** Whether systemd-run takes --expand-environment (systemd 254 and later). */
  expandFlag: boolean;
};

/** The full systemd-run argument list, bubblewrap's included. Pure, so the isolation flags are easy to test. */
export function sandboxArgs(run: SandboxRun, unit: string, layout: HostLayout): string[] {
  const scope = [
    "--user", "--scope", "--quiet", "--collect", `--unit=${unit}`, "--slice=app.slice",
    // systemd-run would otherwise replace $NAME and $$ in the command, which is shell code meant for the sandbox.
    ...(layout.expandFlag ? ["--expand-environment=no"] : []),
    "-p", `MemoryMax=${run.memoryMb}M`, "-p", "MemorySwapMax=0",
    "-p", `TasksMax=${run.tasks ?? DEFAULT_TASKS}`, "-p", "CPUQuota=200%",
    // A program over the limit is killed; the driver goes on and reports it (DESIGN §4.6).
    "-p", "OOMPolicy=continue",
    "--",
  ];
  const sandbox = [
    "bwrap", "--unshare-all", "--die-with-parent", "--new-session", "--as-pid-1", "--clearenv",
    "--ro-bind", "/usr", "/usr",
  ];
  for (const [target, path] of layout.links) sandbox.push("--symlink", target, path);
  for (const dir of layout.dirs) sandbox.push("--ro-bind", dir, dir);
  for (const file of layout.etc) sandbox.push("--ro-bind", file, file);
  for (const name of ["passwd", "group"]) sandbox.push("--ro-bind", join(layout.generatedEtc, name), `/etc/${name}`);
  if (run.network) {
    sandbox.push("--share-net");
    for (const file of layout.networkEtc) sandbox.push("--ro-bind", file, file);
  } else {
    sandbox.push("--ro-bind", join(layout.generatedEtc, "hosts"), "/etc/hosts");
  }
  sandbox.push("--proc", "/proc", "--dev", "/dev", "--size", String(TMP_BYTES), "--tmpfs", "/tmp");
  for (const m of run.mounts) sandbox.push(m.writable ? "--bind" : "--ro-bind", m.host, m.container);
  sandbox.push("--chdir", run.cwd ?? (run.mounts.some((m) => m.container === "/work/src") ? "/work/src" : "/tmp"));
  const own = { HOME: "/tmp", PATH: "/opt/env/bin:/usr/bin:/bin", TRACK: "/opt/track", LANG: "C.UTF-8" };
  for (const [name, value] of Object.entries(own)) sandbox.push("--setenv", name, value);
  for (const [name, value] of Object.entries(run.env)) sandbox.push("--setenv", name, value);
  return [...scope, ...sandbox, ...run.command];
}

/** The resolver and certificate files an install needs, where this distribution keeps them. */
const NETWORK_ETC = ["/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/etc/ssl", "/etc/ca-certificates", "/etc/pki"];

let layout: HostLayout | undefined;

/** Reads this computer's system folders once, and writes the sandbox's own passwd, group and hosts. */
export function hostLayout(): HostLayout {
  if (layout) return layout;
  const links: [string, string][] = [];
  const dirs: string[] = [];
  for (const path of ["/bin", "/sbin", "/lib", "/lib64"]) {
    if (!existsSync(path)) continue;
    if (lstatSync(path).isSymbolicLink()) links.push([readlinkSync(path), path]);
    else dirs.push(path);
  }
  layout = {
    links,
    dirs,
    etc: ["/etc/ld.so.cache", "/etc/localtime"].filter((p) => existsSync(p)),
    generatedEtc: writeSandboxEtc(),
    // A link (resolv.conf often points into /run) is mounted as the file it points at.
    networkEtc: NETWORK_ETC.filter((p) => existsSync(p)),
    expandFlag: /--expand-environment/.test(spawnSync("systemd-run", ["--help"], { encoding: "utf8", timeout: 10_000 }).stdout ?? ""),
  };
  return layout;
}

/** One user and one group, the learner's own ids, so tools that look up the current user find one. */
function writeSandboxEtc(): string {
  const dir = join(codeLearnHome(), "sandbox", "etc");
  mkdirSync(dir, { recursive: true });
  const uid = process.getuid?.() ?? 65534;
  const gid = process.getgid?.() ?? 65534;
  const files = {
    passwd: `learner:x:${uid}:${gid}:learner:/tmp:/bin/sh\n`,
    group: `learner:x:${gid}:\n`,
    hosts: "127.0.0.1 localhost\n::1 localhost\n",
  };
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name);
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) writeTextAtomic(path, text, 0o644);
  }
  return realpathSync(dir);
}

/** Output as it arrives, within the output cap. A handler that throws is dropped; the run goes on. */
export type SandboxOutput = { stdout?: (chunk: Buffer) => void; stderr?: (chunk: Buffer) => void };

/**
 * A started sandbox: typed input (when `stdin` is set), a kill, and its result. `write` returns false, and drops the
 * text, when it's too long, when input the program isn't reading has piled up, or after the end. `end` closes the
 * input, as end of input in a terminal does.
 */
export type StartedSandbox = {
  write(text: string): boolean;
  end(): void;
  kill(): void;
  done: Promise<SandboxResult>;
  /** Whether the kernel killed a process in this sandbox for its memory limit, so far. */
  hadOomKill(): Promise<boolean>;
};

const MAX_WRITE = 64 * 1024;
const MAX_PENDING_INPUT = 1024 * 1024;

/** Starts one sandbox: every flag in sandboxArgs, the output cap, the host deadline and a checked stop. */
export function startSandboxed(run: SandboxRun, output: SandboxOutput = {}): StartedSandbox {
  const unit = `${SCOPE_PREFIX}${process.pid}-${randomBytes(6).toString("hex")}`;
  const child = spawn("systemd-run", sandboxArgs(run, unit, hostLayout()), { stdio: [run.stdin ? "pipe" : "ignore", "pipe", "pipe"] });
  const memory = watchMemoryKills(unit);
  const chunks: Buffer[] = [];
  const handlers = { ...output };
  let bytes = 0;
  let stderr = "";
  let flooded = false;
  let timedOut = false;
  let ended = false;
  let cleanup: Promise<boolean> | undefined;
  // Killing bubblewrap ends its PID namespace and every process in it; stopping the scope is the backstop.
  const stop = () => {
    ended = true;
    if (cleanup) return;
    child.kill("SIGKILL");
    cleanup = stopScope(unit);
  };
  const outputCap = run.outputCap ?? OUTPUT_CAP;
  const count = (n: number) => {
    bytes += n;
    if (bytes > outputCap) {
      flooded = true;
      stop();
    }
  };
  const tell = (stream: "stdout" | "stderr", b: Buffer) => {
    try {
      handlers[stream]?.(b);
    } catch {
      delete handlers[stream];
    }
  };
  child.stdout!.on("data", (b: Buffer) => {
    if (bytes + b.length <= OUTPUT_CAP) chunks.push(b);
    if (bytes + b.length <= outputCap) tell("stdout", b);
    count(b.length);
  });
  child.stderr!.on("data", (b: Buffer) => {
    if (stderr.length < 16_384) stderr += b.toString("utf8");
    if (bytes + b.length <= outputCap) tell("stderr", b);
    count(b.length);
  });
  // A program that stops reading, or exits, closes the pipe; typing after that is dropped, not an error.
  child.stdin?.on("error", () => undefined);
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, run.deadlineMs);
  const done = new Promise<SandboxResult>((resolve) => {
    child.on("close", async (code, signal) => {
      ended = true;
      clearTimeout(timer);
      const removed = cleanup ? await cleanup : true;
      // A signal with no exit code is a kill from outside the sandbox, framed as Docker's 137 was.
      const exit = code ?? (signal ? 137 : -1);
      const oomKilled = exit !== 0 && !cleanup && (await memory.kills()) > 0;
      memory.stop();
      resolve({ exit, stdout: Buffer.concat(chunks), stderr, flooded, timedOut, cleanupFailed: !removed, oomKilled });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      memory.stop();
      resolve({ exit: -1, stdout: Buffer.alloc(0), stderr: e.message, flooded, timedOut, cleanupFailed: false, oomKilled: false });
    });
  });
  return {
    write: (text) => {
      const stdin = child.stdin;
      const size = Buffer.byteLength(text);
      if (ended || !stdin?.writable || size > MAX_WRITE || stdin.writableLength + size > MAX_PENDING_INPUT) return false;
      stdin.write(text);
      return true;
    },
    end: () => {
      if (!ended && child.stdin?.writable) child.stdin.end();
    },
    kill: stop,
    done,
    hadOomKill: async () => (await memory.kills()) > 0,
  };
}

export function runSandboxed(run: SandboxRun): Promise<SandboxResult> {
  return startSandboxed(run).done;
}

let managerGroup: string | undefined;

/** The systemd user manager's cgroup, under which every scope's app.slice is (asked once). */
function userManagerGroup(): string | undefined {
  if (managerGroup) return managerGroup;
  const shown = spawnSync("systemctl", ["--user", "show", "-p", "ControlGroup", "--value"], { encoding: "utf8", timeout: 5_000 });
  const group = shown.stdout?.trim();
  if (group) managerGroup = group;
  return managerGroup;
}

/**
 * Follows a scope's memory-kill count (`oom_kill` in its cgroup's memory.events). The scope's cgroup is gone as soon
 * as its last process exits, so the file is watched from the moment it appears (the kernel reports each change to
 * it as a file change) and also read on a short timer. `kills()` reads it once more if it still can, and otherwise
 * returns the highest count seen.
 */
function watchMemoryKills(unit: string): { kills(): Promise<number>; stop(): void } {
  const manager = userManagerGroup();
  const events = manager ? join("/sys/fs/cgroup", manager, "app.slice", `${unit}.scope`, "memory.events") : undefined;
  let highest = 0;
  let watcher: FSWatcher | undefined;
  const read = () => {
    if (!events) return;
    try {
      const m = /^oom_kill (\d+)$/m.exec(readFileSync(events, "utf8"));
      if (m) highest = Math.max(highest, Number(m[1]));
    } catch {
      // Not there yet, or gone; keep the highest count seen.
    }
  };
  const timer = setInterval(() => {
    read();
    if (events && !watcher && existsSync(events)) {
      try {
        watcher = watch(events, read);
        watcher.on("error", () => undefined);
      } catch {
        // Gone between the check and the watch; the timer still reads it.
      }
    }
  }, OOM_POLL_MS);
  timer.unref();
  return {
    kills: async () => {
      read();
      return highest;
    },
    stop: () => {
      clearInterval(timer);
      watcher?.close();
    },
  };
}

/** Stops a scope, with a deadline. True when it's gone, including when it ended by itself first. */
function stopScope(unit: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("systemctl", ["--user", "stop", unit], { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, STOP_MS);
    child.on("close", () => {
      clearTimeout(timer);
      resolve(!scopeActive(unit));
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

const scopeActive = (unit: string) =>
  spawnSync("systemctl", ["--user", "is-active", "--quiet", unit], { stdio: "ignore", timeout: 5_000 }).status === 0;

// ---------- requirements ----------

/** Why this computer can't run sandboxes: its code, and the message, whose last part (`help`) says what to do. */
export type SandboxProblem = { code: InfraCode; message: string; help: string };
const problem = (code: InfraCode, lead: string, help: string): SandboxProblem => ({ code, message: `${lead} ${help}`, help });

const INSTALL_BWRAP = "Install bubblewrap 0.9 or later from your distribution (the package is usually called bubblewrap), then retry.";
const START_SESSION = "code-learn needs a systemd user session for its sandbox limits. Log in to a desktop session (not only su or sudo), then retry.";

/** What the sandbox's own failure output means, as a stable code. */
export function sandboxIssue(output: string): SandboxProblem {
  if (/failed to connect to (?:the )?bus|failed to create bus connection|no medium found|XDG_RUNTIME_DIR/i.test(output)) {
    return problem("no-user-session", "The systemd user session isn't reachable.", START_SESSION);
  }
  if (/bwrap:.*(?:namespace|uid map|operation not permitted|permission denied)/i.test(output)) {
    return problem(
      "sandbox-blocked",
      "This computer doesn't let bubblewrap create its sandbox.",
      "Allow unprivileged user namespaces (on Ubuntu, keep the bubblewrap AppArmor profile; elsewhere set kernel.unprivileged_userns_clone=1), then retry.",
    );
  }
  return problem("sandbox-failed", "The sandbox failed to start.", "Run `code-learn doctor`, then retry.");
}

/** bubblewrap's version, or undefined when it isn't installed. */
export function bwrapVersion(): string | undefined {
  const r = spawnSync("bwrap", ["--version"], { encoding: "utf8", timeout: 10_000 });
  return r.status === 0 ? /(\d+\.\d+(?:\.\d+)?)/.exec(r.stdout)?.[1] : undefined;
}

const atLeast = (version: string, major: number, minor: number) => {
  const [a = 0, b = 0] = version.split(".").map(Number);
  return a > major || (a === major && b >= minor);
};

/** Checks every requirement, with a canary run; undefined when sandboxes work here. */
export async function sandboxDown(): Promise<SandboxProblem | undefined> {
  if (process.getuid?.() === 0) {
    return problem("sandbox-root", "code-learn is running as root.", "Run it as your own user: a sandbox run as root would own every file it mounts.");
  }
  const version = bwrapVersion();
  if (!version) return problem("no-sandbox", "bubblewrap (bwrap) isn't installed.", INSTALL_BWRAP);
  if (!atLeast(version, 0, 9)) return problem("no-sandbox", `bubblewrap ${version} is too old.`, INSTALL_BWRAP);
  const canary = await runSandboxed({ command: ["/bin/sh", "-c", "exit 0"], env: {}, mounts: [], memoryMb: 64, deadlineMs: 30_000, tasks: 16 });
  if (canary.exit === 0) return undefined;
  if (canary.exit === -1 && /ENOENT/.test(canary.stderr)) return problem("no-user-session", "systemd-run isn't installed.", START_SESSION);
  return sandboxIssue(canary.stderr);
}

let ready: Promise<void> | undefined;

/** Fails with the sandbox's problem as an infrastructure error. A success is remembered for the process. */
export function assertRuntime(): Promise<void> {
  ready ??= sandboxDown().then((down) => {
    if (down) {
      ready = undefined;
      throw infraError(down.message, down.code);
    }
  });
  return ready;
}

/** A run lost to the sandbox failing: nothing is recorded. */
export function lostRun(down: SandboxProblem, tail = ""): CodeLearnError {
  return infraError(`${down.message.replace(/\.$/, "")}${tail}.`, down.code);
}

// ---------- leftovers ----------

/** Scopes code-learn started, with the PID of the process that owns each. */
export function ownedScopes(): { unit: string; pid: number }[] {
  const listed = spawnSync("systemctl", ["--user", "list-units", "--type=scope", "--all", "--plain", "--no-legend", `${SCOPE_PREFIX}*`], { encoding: "utf8", timeout: 10_000 });
  if (listed.status !== 0) return [];
  return listed.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .flatMap((unit) => {
      const pid = /^code-learn-(\d+)-[0-9a-f]+\.scope$/.exec(unit)?.[1];
      return pid ? [{ unit, pid: Number(pid) }] : [];
    });
}

/** Stops the scopes whose owner process is gone (`doctor --fix`). Live processes' scopes are never touched. */
export async function removeAbandoned(): Promise<{ abandoned: number; left: number }> {
  const abandoned = ownedScopes().filter((s) => !processAlive(s.pid));
  let left = 0;
  for (const scope of abandoned) if (!(await stopScope(scope.unit))) left++;
  return { abandoned: abandoned.length, left };
}
