// Run folders (DESIGN §4.3): where a check, Run and the self-test stage the files they mount into a sandbox.
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { codeLearnHome, processAlive } from "./store.js";

/**
 * `<real code-learn home>/runs`, under code-learn's home where hidden data already lives, never the shared OS temp
 * folder. It's the real path, so a linked home is mounted by the name that exists.
 */
export function runsDir(): string {
  mkdirSync(codeLearnHome(), { recursive: true });
  return join(realpathSync.native(codeLearnHome()), "runs");
}

export type RunFolder = { dir: string; remove(): void };

/**
 * A fresh folder for one sandbox run, named after the code-learn process that owns it (`<pid>-<random>`), so a crash
 * leaves a folder that the next run can tell is abandoned. Folders of crashed processes are removed first.
 */
export function stageRunFolder(): RunFolder {
  const root = runsDir();
  mkdirSync(root, { recursive: true });
  removeAbandonedRuns();
  const dir = mkdtempSync(join(root, `${process.pid}-`));
  // Best effort: a folder that can't be removed now must not fail the run or hide its result. It's removed with the
  // other leftovers once this process is gone.
  return { dir, remove: () => removeFolder(dir) };
}

function removeFolder(dir: string): boolean {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return true;
  } catch {
    // Left for the next sweep.
    return false;
  }
}

/** What `mkdtemp` makes of `<pid>-`: the PID, then six letters or digits. Nothing else in `runs/` is code-learn's to remove. */
const RUN_FOLDER = /^(\d+)-[A-Za-z0-9]{6}$/;

/** Removes the run folders whose code-learn process is gone, as abandoned scopes are (DESIGN §10). Live processes' folders are never touched. */
export function removeAbandonedRuns(): number {
  const root = runsDir();
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const owner = RUN_FOLDER.exec(name)?.[1];
    if (owner === undefined || processAlive(Number(owner))) continue;
    // A real folder only: a link or a file with this name isn't one code-learn made.
    try {
      if (!lstatSync(join(root, name)).isDirectory()) continue;
    } catch {
      continue;
    }
    if (removeFolder(join(root, name))) removed++;
  }
  return removed;
}
