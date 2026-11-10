/**
 * What syncs to the learner's private GitHub repository, and how synced files merge when two computers changed them
 * (desktop DESIGN "Sync"). Pure: paths and text in, decisions and text out.
 */

/** The two folders a sync copies: code-learn's home (courses, tracks) and the workspace (the learner's files). */
export type SyncRoot = "home" | "workspace";

/** Locks, temp files, staging and discarded folders, and torn-log backups: this computer's alone. */
function isLeftover(name: string): boolean {
  return name.endsWith(".lock") || name.endsWith(".reclaim") || name.startsWith(".code-learn-") || name.startsWith(".staging-")
    || name.startsWith(".discard-") || name.includes(".bak-");
}

/**
 * Whether a path, relative to its root with `/` separators, syncs. An allowlist: courses (with their hidden tests, in
 * the learner's private repository) and tracks from the home; the learner's files and code-learn.json from the
 * workspace. Toolchains, caches, runs, the sandbox's files and the agents' config (it holds this computer's paths) don't.
 */
export function isSynced(root: SyncRoot, path: string): boolean {
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || isLeftover(part))) return false;
  if (root === "workspace") return path === "code-learn.json" || (parts[0] === "exercises" && parts.length > 1);
  return (parts[0] === "courses" || parts[0] === "tracks") && parts.length > 2;
}

const lines = (text: string) => text.split("\n").filter((line) => line !== "");
const timeOf = (line: string) => (JSON.parse(line) as { at: string }).at;

/**
 * Merges a course's event log changed on two computers. The log is append-only and replayed in order, so the lines
 * both share stay first, then each side's new lines, in time order; a line both added is kept once. Two logs that no
 * longer share the old one (a log repaired on one computer) keep every line of both, in time order.
 */
export function mergeLog(base: string, ours: string, theirs: string): string {
  const shared = ours.startsWith(base) && theirs.startsWith(base) ? lines(base) : [];
  const added = [...lines(ours).slice(shared.length), ...lines(theirs).slice(shared.length)];
  const unique = [...new Set(added)];
  // sort is stable, so lines at the same moment keep this computer's first.
  unique.sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
  return [...shared, ...unique].map((line) => `${line}\n`).join("");
}

/** Lesson notes written on two computers: this computer's first, then the other's under its name. */
export function mergeNotes(ours: string, theirs: string, from: string): string {
  return `${ours.trimEnd()}\n\n---\n\nFrom ${from}:\n\n${theirs.trimEnd()}\n`;
}
