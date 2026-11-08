// Installing a track's toolchain (DESIGN §4.6). micromamba creates the conda environment in a staging folder, inside an
// install sandbox that has network, then the track's setup runs there. The caller renames the staging folder into
// place only after the track's gates pass, so an installed toolchain is always a verified one.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { CodeLearnError, infraError, type InfraCode } from "./errors.js";
import { type FileMap, writeFileMap } from "./files.js";
import type { ToolchainFolders } from "./judge.js";
import { assertRuntime, lostRun, type Mount, type SandboxRun, sandboxDown, startSandboxed } from "./sandbox.js";
import type { ToolchainSpec } from "./schemas.js";
import * as store from "./store.js";

/** Both install steps together share this limit (DESIGN §4.6). */
export const INSTALL_LIMIT_MS = 600_000;
const INSTALL_MEMORY_MB = 4096;
const INSTALL_TASKS = 1024;
/** Install logs can be long; past this the step is stopped as a flood. */
const INSTALL_OUTPUT_CAP = 64 * 1024 * 1024;
/** How much of the end of a failed step's log its message shows. */
const LOG_TAIL = 4096;

export type InstallStep = { done: number; total: number };

/** A staged toolchain: its folders, the package files micromamba installed, and a way to discard it. */
export type StagedToolchain = { root: string; folders: ToolchainFolders; resolved: string[]; remove(): void };

/** The micromamba binary and its version: CODE_LEARN_MICROMAMBA, else `micromamba` on PATH. */
export function micromamba(): { bin: string; version: string } {
  const configured = process.env.CODE_LEARN_MICROMAMBA;
  const bin = configured || findOnPath("micromamba");
  const missing = "micromamba isn't installed, so no track can be installed. Install micromamba 2 (https://mamba.readthedocs.io), or set CODE_LEARN_MICROMAMBA to its path, then retry.";
  if (!bin || !isAbsolute(bin) || !existsSync(bin)) throw infraError(missing, "no-micromamba");
  const answer = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10_000 });
  const version = /(\d+)\.(\d+)\.(\d+)/.exec(answer.stdout ?? "")?.[0];
  if (answer.status !== 0 || !version) throw infraError(missing, "no-micromamba");
  if (Number(version.split(".")[0]) < 2) throw infraError(`micromamba ${version} is too old. Install micromamba 2 or later, then retry.`, "no-micromamba");
  return { bin, version };
}

function findOnPath(name: string): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * What a failed install step's log means when it is this computer's problem (DESIGN §4.4): the network, certificates,
 * a rate limit or the disk. Anything else is the track's: a package that doesn't exist, or a setup that fails.
 */
export function installProblem(log: string): { code: InfraCode; message: string } | undefined {
  if (/no space left on device/i.test(log)) return { code: "host-disk", message: "The disk is full. Free some space where code-learn keeps its data, then try again." };
  if (/timeout was reached|operation timed out/i.test(log)) return { code: "network-timeout", message: "The download stalled. Check the internet connection, then try again." };
  if (/ssl certificate problem|ssl peer certificate|certificate verify failed/i.test(log)) {
    return { code: "tls", message: "A certificate check failed while downloading. A network filter may be intercepting secure connections; try another network." };
  }
  if (/\b429\b|too many requests/i.test(log)) return { code: "rate-limit", message: "The package server asked to slow down. Wait a few minutes, then try again." };
  if (/could not resolve host|couldn't resolve host|network is unreachable|failed to connect|connection refused|temporary failure in name resolution/i.test(log)) {
    return { code: "offline", message: "code-learn couldn't reach the package server. Check the internet connection, then try again." };
  }
  return undefined;
}

/**
 * Installs a track's toolchain into a fresh staging folder: its packages, then its setup, each in an install sandbox,
 * with the track's files (all but track.yaml and probe/) copied to `track/`. `onStep` hears each step as it starts.
 * A failure removes the staging folder; this computer's problems are infrastructure errors and the track's are not.
 */
export async function stageToolchain(spec: ToolchainSpec, trackFiles: FileMap, onStep?: (step: InstallStep) => void): Promise<StagedToolchain> {
  const { bin } = micromamba();
  await assertRuntime();
  store.assertFreeSpace(store.codeLearnHome());
  mkdirSync(store.envsDir(), { recursive: true });
  removeAbandonedStaging();
  const root = mkdtempSync(join(store.envsDir(), `.staging-${process.pid}-`));
  const folders = store.toolchainFolders(root);
  const remove = () => rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  try {
    mkdirSync(folders.env);
    mkdirSync(folders.track);
    writeFileMap(folders.track, trackFiles);
    mkdirSync(store.packageCacheDir(), { recursive: true });
    const total = spec.setup ? 2 : 1;
    const deadline = Date.now() + INSTALL_LIMIT_MS;
    const mounts: Mount[] = [
      { host: realpathSync(bin), container: "/opt/micromamba" },
      { host: folders.env, container: "/opt/env", writable: true },
      { host: folders.track, container: "/opt/track", writable: true },
      { host: store.packageCacheDir(), container: "/opt/pkgs", writable: true },
    ];
    onStep?.({ done: 1, total });
    // Separate arguments, never a shell; the schema makes every package start with a letter or digit.
    const create = ["/opt/micromamba", "create", "--yes", "--prefix", "/opt/env", "--override-channels", "--channel", "conda-forge", ...spec.packages];
    await installStep({ command: create, env: { MAMBA_ROOT_PREFIX: "/opt/pkgs" }, mounts, cwd: "/opt/track" }, deadline, "the packages couldn't be installed");
    if (spec.setup) {
      onStep?.({ done: 2, total });
      await installStep({ command: ["/bin/sh", "-c", spec.setup], env: spec.env, mounts, cwd: "/opt/track" }, deadline, "the setup command failed");
    }
    return { root, folders, resolved: installedPackages(folders.env), remove };
  } catch (e) {
    remove();
    throw e;
  }
}

type StepRun = Pick<SandboxRun, "command" | "env" | "mounts" | "cwd">;

/** One install step in its sandbox. Resolves when it exits 0; otherwise throws, blaming the computer or the track. */
async function installStep(step: StepRun, deadline: number, failed: string): Promise<void> {
  let log = "";
  const keep = (chunk: Buffer) => {
    log = (log + chunk.toString("utf8")).slice(-4 * LOG_TAIL);
  };
  const run: SandboxRun = {
    ...step, memoryMb: INSTALL_MEMORY_MB, tasks: INSTALL_TASKS, network: true,
    deadlineMs: Math.max(1_000, deadline - Date.now()), outputCap: INSTALL_OUTPUT_CAP,
  };
  const r = await startSandboxed(run, { stdout: keep, stderr: keep }).done;
  if (r.exit === 0 && !r.timedOut && !r.flooded) return;
  const tail = log.trim().slice(-LOG_TAIL);
  const known = installProblem(log);
  if (known) throw infraError(known.message, known.code);
  if (r.timedOut) {
    throw new CodeLearnError(`${failed}: it didn't finish within ${INSTALL_LIMIT_MS / 60_000} minutes. Install fewer or smaller packages, or make the setup faster.${shown(tail)}`);
  }
  if (r.flooded) throw new CodeLearnError(`${failed}: it printed more than ${INSTALL_OUTPUT_CAP / 1024 ** 2} MB. Make it quieter.`);
  // Nothing printed and a failing exit: the sandbox itself may be what failed.
  if (!tail) {
    const down = await sandboxDown();
    if (down) throw lostRun(down, ", so nothing was installed");
  }
  if (r.oomKilled) throw new CodeLearnError(`${failed}: it ran out of memory (${INSTALL_MEMORY_MB} MB).${shown(tail)}`);
  throw new CodeLearnError(`${failed} (exit ${r.exit}).${shown(tail)}`);
}

const shown = (tail: string) => (tail ? `\nIt printed:\n${tail}` : "");

/** The package files micromamba recorded in the environment's conda-meta folder, sorted: what the track runs on. */
function installedPackages(env: string): string[] {
  const meta = join(env, "conda-meta");
  if (!existsSync(meta)) throw new CodeLearnError("the packages couldn't be installed: micromamba made no environment.");
  return readdirSync(meta).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -".json".length)).sort();
}

/**
 * Moves a staged toolchain into `envs/<ref>/`. An older one is renamed aside first and removed after, so the track's
 * folder is always either the old toolchain or the new one. Call while holding the track lock.
 */
export function commitToolchain(staged: StagedToolchain, ref: string): void {
  const target = store.envDir(ref);
  const aside = existsSync(target) ? join(store.envsDir(), `.discard-${process.pid}-${randomBytes(3).toString("hex")}`) : undefined;
  if (aside) renameSync(target, aside);
  try {
    renameSync(staged.root, target);
  } catch (e) {
    if (aside) renameSync(aside, target);
    throw e;
  }
  if (aside) rmSync(aside, { recursive: true, force: true, maxRetries: 3 });
}

/** Deletes a track's toolchain: renamed aside first, so a removal that stops halfway never looks installed. */
export function removeToolchain(ref: string): void {
  const target = store.envDir(ref);
  if (!existsSync(target)) return;
  const aside = join(store.envsDir(), `.discard-${process.pid}-${randomBytes(3).toString("hex")}`);
  renameSync(target, aside);
  rmSync(aside, { recursive: true, force: true, maxRetries: 3 });
}

/** A staging or discarded folder's name carries its owner's PID, so a crashed install's can be told apart. */
const LEFTOVER = /^\.(?:staging|discard)-(\d+)-[A-Za-z0-9]{6}$/;

/** Removes the staging and discarded folders whose owner process is gone. Live processes' are never touched. */
export function removeAbandonedStaging(): number {
  let names: string[];
  try {
    names = readdirSync(store.envsDir());
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const owner = LEFTOVER.exec(name)?.[1];
    if (owner === undefined || store.processAlive(Number(owner))) continue;
    const path = join(store.envsDir(), name);
    // A real folder only: a link or a file with this name isn't one code-learn made.
    if (!lstatSync(path).isDirectory()) continue;
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
    removed++;
  }
  return removed;
}
