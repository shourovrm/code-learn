// `code-learn doctor` (DESIGN §4.6, §10): this computer's requirements, a self-test of the sandbox's isolation, and
// leftovers from crashed runs.
import { accessSync, constants, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stageRunFolder } from "./runs.js";
import { bwrapVersion, ownedScopes, removeAbandoned, runSandboxed, sandboxDown } from "./sandbox.js";
import { codeLearnHome, processAlive } from "./store.js";
import { micromamba } from "./toolchain.js";

/** `kind`: when this computer's network, disk or sandbox is the cause, as an error's kind says it (errors.ts). */
export type Check = { name: string; ok: boolean; detail: string; kind?: "offline" | "disk" | "sandbox" };

/** bubblewrap and the systemd user session, proven with a canary run. */
async function sandbox(): Promise<Check> {
  const name = "sandbox";
  const down = await sandboxDown();
  if (down) return { name, ok: false, kind: "sandbox", detail: down.message };
  return { name, ok: true, detail: `bubblewrap ${bwrapVersion()}, systemd user session` };
}

function packageManager(): Check {
  const name = "package manager";
  try {
    const { bin, version } = micromamba();
    return { name, ok: true, detail: `micromamba ${version} (${bin})` };
  } catch (e) {
    return { name, ok: false, kind: "sandbox", detail: (e as Error).message };
  }
}

function dataFolder(): Check {
  const name = "code-learn home";
  try {
    mkdirSync(codeLearnHome(), { recursive: true });
    accessSync(codeLearnHome(), constants.W_OK);
    return { name, ok: true, detail: codeLearnHome() };
  } catch {
    return { name, ok: false, kind: "disk", detail: `${codeLearnHome()} isn't writable` };
  }
}

/**
 * What a check's sandbox must not be able to do, each tried from inside one (DESIGN §4.6). The script prints one word
 * per rule that holds, so a missing word names the rule that failed.
 */
const ISOLATION_RULES: [word: string, rule: string][] = [
  ["no-network", "no network but loopback"],
  ["no-home", "the home folder is hidden"],
  ["no-data", "code-learn's data is hidden"],
  ["input-ro", "mounted files are read-only"],
  ["usr-ro", "/usr is read-only"],
];

/** Runs the isolation self-test in the same sandbox a check gets. */
export async function isolation(): Promise<Check> {
  const name = "sandbox isolation";
  const folder = stageRunFolder();
  try {
    mkdirSync(join(folder.dir, "src"));
    writeFileSync(join(folder.dir, "src", "probe.txt"), "probe\n");
    const home = JSON.stringify(realpathSync(homedir()));
    const data = JSON.stringify(realpathSync(codeLearnHome()));
    const script = [
      `[ "$(tail -n +3 /proc/net/dev | cut -d: -f1 | tr -d ' ')" = lo ] && echo no-network`,
      `[ -e ${home} ] || echo no-home`,
      `[ -e ${data} ] || echo no-data`,
      "{ : > probe.txt; } 2>/dev/null || echo input-ro",
      "{ : > /usr/.code-learn-probe; } 2>/dev/null || echo usr-ro",
    ].join("\n");
    const r = await runSandboxed({
      command: ["/bin/sh", "-c", script], env: {}, mounts: [{ host: join(folder.dir, "src"), container: "/work/src" }],
      memoryMb: 64, deadlineMs: 30_000, tasks: 32,
    });
    const held = new Set(r.stdout.toString().split("\n"));
    const broken = ISOLATION_RULES.filter(([word]) => !held.has(word)).map(([, rule]) => rule);
    if (r.exit !== 0) return { name, ok: false, kind: "sandbox", detail: `the self-test didn't run (exit ${r.exit})` };
    if (broken.length > 0) return { name, ok: false, kind: "sandbox", detail: `these rules didn't hold: ${broken.join("; ")}` };
    return { name, ok: true, detail: ISOLATION_RULES.map(([, rule]) => rule).join("; ") };
  } finally {
    folder.remove();
  }
}

/** Abandoned sandboxes are ones whose owning code-learn process is gone; live checks are never touched. */
async function leftovers(fix: boolean): Promise<Check> {
  const name = "leftover sandboxes";
  const owned = ownedScopes();
  const abandoned = owned.filter((s) => !processAlive(s.pid));
  if (abandoned.length === 0) return { name, ok: true, detail: owned.length ? `none abandoned (${owned.length} in use by running checks)` : "none" };
  if (!fix) return { name, ok: false, detail: `${abandoned.length} abandoned; run code-learn doctor --fix` };
  const removed = await removeAbandoned();
  return removed.left === 0
    ? { name, ok: true, detail: `stopped ${removed.abandoned}` }
    : { name, ok: false, detail: `couldn't stop ${removed.left} of ${removed.abandoned}` };
}

export async function doctor(fix: boolean): Promise<Check[]> {
  const first = await sandbox();
  const checks = [first, packageManager(), dataFolder()];
  if (!first.ok) return checks;
  checks.push(await isolation());
  checks.push(await leftovers(fix));
  return checks;
}
