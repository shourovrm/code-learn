import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { CodeLearnError } from "../errors.js";
import * as store from "../store.js";
import { isSynced, type SyncRoot } from "../sync.js";

/**
 * A file a sync brought in, by its path in the sync folder ("home/courses/c/events.jsonl", "workspace/exercises/…").
 * Without `text` it was deleted. `was` is an event log as this computer exported it, so lines appended here since
 * aren't lost.
 */
export interface SyncChange {
  path: string;
  text?: string;
  was?: string;
}

const rootDir = (ws: string, root: SyncRoot) => (root === "home" ? store.codeLearnHome() : ws);

/** Every file under `dir` that syncs, relative to the root, skipping symlinks: a sync never follows one. */
function syncedFiles(root: SyncRoot, base: string, dir: string): string[] {
  const full = join(base, dir);
  if (!existsSync(full)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...syncedFiles(root, base, rel));
    else if (entry.isFile() && isSynced(root, rel)) found.push(rel);
  }
  return found;
}

function copyInto(from: string, to: string, files: string[]): void {
  for (const rel of files) {
    mkdirSync(dirname(join(to, rel)), { recursive: true });
    copyFileSync(join(from, rel), join(to, rel));
  }
}

/** The lock a path's writer holds: its course's, its track's, or the workspace's. */
function lockFor(ws: string, root: SyncRoot, rel: string): string {
  const [top, name] = rel.split("/");
  if (root === "workspace") return store.workspaceLock(ws);
  if (top === "courses") return store.courseLockPath(name);
  return store.trackLockPath(store.parseTrackRef(name).id);
}

/**
 * Copies everything that syncs into `dest`, as `dest/home/…` and `dest/workspace/…`. Each course, track and the
 * workspace is copied under its lock, so a log is never copied half-written.
 */
export async function exportForSync(ws: string, dest: string): Promise<void> {
  const home = store.codeLearnHome();
  for (const top of ["courses", "tracks"]) {
    const folder = join(home, top);
    if (!existsSync(folder)) continue;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isSynced("home", `${top}/${entry.name}/x`)) continue;
      const rel = `${top}/${entry.name}`;
      await store.withLock(lockFor(ws, "home", rel), async () => copyInto(home, join(dest, "home"), syncedFiles("home", home, rel)));
    }
  }
  await store.withWorkspaceLock(ws, async () => copyInto(ws, join(dest, "workspace"), syncedFiles("workspace", ws, "")));
}

/** Removes the folders a deletion left empty, up to the root. */
function pruneEmpty(base: string, rel: string): void {
  for (let dir = dirname(rel); dir !== "."; dir = dirname(dir)) {
    const full = join(base, dir);
    if (!existsSync(full) || readdirSync(full).length > 0) return;
    rmdirSync(full);
  }
}

function apply(base: string, rel: string, change: SyncChange): void {
  const target = store.refuseSymlinks(base, rel);
  if (change.text === undefined) {
    rmSync(target, { force: true });
    pruneEmpty(base, rel);
    return;
  }
  let text = change.text;
  // Lines this computer appended while the sync ran follow the merged log.
  if (change.was !== undefined && existsSync(target)) {
    const now = readFileSync(target, "utf8");
    if (now.startsWith(change.was)) text += now.slice(change.was.length);
  }
  mkdirSync(dirname(target), { recursive: true });
  store.writeTextAtomic(target, text);
}

/**
 * Writes and deletes the files a sync brought in, each under its writer's lock, atomically. Refuses any path that
 * doesn't sync, so a repository can't write a toolchain, a lock or anything outside code-learn's folders.
 */
export async function importFromSync(ws: string, changes: SyncChange[]): Promise<void> {
  const byLock = new Map<string, { base: string; rel: string; change: SyncChange }[]>();
  for (const change of changes) {
    const [root, ...rest] = change.path.split("/");
    const rel = rest.join("/");
    if ((root !== "home" && root !== "workspace") || !isSynced(root, rel)) throw new CodeLearnError(`${change.path} doesn't sync, so it wasn't written.`);
    const lock = lockFor(ws, root, rel);
    byLock.set(lock, [...(byLock.get(lock) ?? []), { base: rootDir(ws, root), rel, change }]);
  }
  for (const [lock, writes] of byLock) {
    await store.withLock(lock, async () => {
      for (const { base, rel, change } of writes) apply(base, rel, change);
    });
  }
}
