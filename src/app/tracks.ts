import { CodeLearnError } from "../errors.js";
import { assertPortablePaths, type FileMap, validateFileMap } from "../files.js";
import { checkTrackFiles, type TrackProgress, verifyExercise, verifyTrack } from "../gates.js";
import { type Expected, expectedDigest } from "../grading.js";
import type { ToolchainFolders } from "../judge.js";
import type { TrackRecord } from "../schemas.js";
import * as store from "../store.js";
import { commitToolchain, removeToolchain, type StagedToolchain } from "../toolchain.js";
import { installedTrack, quietly } from "./shared.js";

// ---------- tracks ----------

export function listTracks() {
  return store.listTracks().map((t) => ({ track: `${t.id}@${t.version}`, styles: t.styles, files: t.files }));
}

/** Track gate 1, part one: the files are valid, with a toolchain block and complete probes, and name an id@version. */
function readTrackSpec(files: FileMap) {
  assertPortablePaths(validateFileMap(files));
  const { spec } = checkTrackFiles(files);
  return { spec, ref: `${spec.id}@${spec.version}` };
}

/** Track gate 1, part two, under the track lock: true when these files are installed, an error when others are. */
function alreadyInstalled(ref: string, version: number, files: FileMap): boolean {
  if (!store.readTrack(ref)) return false;
  if (JSON.stringify(sorted(store.readTrackFiles(ref))) === JSON.stringify(sorted(files))) return true;
  throw new CodeLearnError(`${ref} is already installed with different files. Save your changes as version ${version + 1}.`);
}

/** Gates 2 to 5, then an atomic install: the toolchain moves into place, then the record. Call while holding the track lock. */
async function install(ref: string, files: FileMap, onProgress?: (p: TrackProgress) => void): Promise<{ installed: string }> {
  // Before installing, and again before committing. Roadmap saves check styles under this same track lock,
  // so no course can change style in between.
  assertCoursesFit(ref, readTrackSpec(files).spec.styles);
  const { spec, staged } = await verifyTrack(files, onProgress);
  try {
    assertCoursesFit(ref, spec.styles);
  } catch (e) {
    staged.remove();
    throw e;
  }
  const { toolchain, ...rest } = spec;
  const record: TrackRecord = { format_version: 1, ...rest, toolchain: { ...toolchain, resolved: staged.resolved }, installedAt: new Date().toISOString() };
  commitToolchain(staged, ref);
  store.commitFolder(store.trackDir(ref), files, { "track.json": record });
  return { installed: ref };
}

/**
 * Every course pinned to `ref` must find its style in the track, or it could never continue. A course's roadmap
 * may name a track before it's installed (DESIGN §5), so this is checked at install, and early when proposing.
 */
function assertCoursesFit(ref: string, styles: string[]): void {
  for (const id of store.listCourses()) {
    const course = store.readCourse(id);
    if (course?.track === ref && (course.style === "io" || course.style === "unit") && !styles.includes(course.style)) {
      throw new CodeLearnError(`Course "${id}" needs style "${course.style}", but ${ref} offers ${styles.join(", ")}. Add ${course.style} to the track's styles, with its probes.`);
    }
  }
}

export async function saveTrack(files: FileMap): Promise<{ installed: string; unchanged?: true }> {
  const { spec, ref } = readTrackSpec(files);
  return store.withLock(store.trackLockPath(spec.id), async () => {
    if (alreadyInstalled(ref, spec.version, files)) return { installed: ref, unchanged: true as const };
    return install(ref, files);
  });
}

/**
 * Removes an installed track: its toolchain folder, then its record (DESIGN §4.6). Refused while a course uses it,
 * since that course could never run a check again.
 */
export async function removeTrack(ref: string): Promise<{ removed: string }> {
  const { id } = store.parseTrackRef(ref);
  return store.withLock(store.trackLockPath(id), async () => {
    installedTrack(ref);
    const using = store.listCourses().filter((course) => store.readCourse(course)?.track === ref);
    if (using.length > 0) {
      throw new CodeLearnError(`${ref} is used by ${using.length === 1 ? "course" : "courses"} ${using.map((c) => `"${c}"`).join(", ")}, so it can't be removed while they need it.`);
    }
    removeToolchain(ref);
    store.removeTrackRecord(ref);
    return { removed: ref };
  });
}

/** io expected outputs as they're compared: by the digest of each, normalized (DESIGN §4.2), in name order. */
const digests = (expected: Record<string, Expected> | undefined) =>
  Object.entries(expected ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, e]) => [name, expectedDigest(e)]);

const sorted = (map: FileMap) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));

// ---------- setup proposals (desktop) ----------
//
// In the desktop app, save_track only proposes. The learner consents in code-learn, and installProposal
// installs exactly the files they were shown, identified by digest.

export async function proposeTrack(files: FileMap): Promise<{ installed: string; unchanged: true } | { proposed: string; note: string }> {
  const { spec, ref } = readTrackSpec(files);
  assertCoursesFit(ref, spec.styles);
  return store.withLock(store.trackLockPath(spec.id), async () => {
    if (alreadyInstalled(ref, spec.version, files)) return { installed: ref, unchanged: true as const };
    store.writeProposal(ref, files);
    return { proposed: ref, note: "The learner decides in code-learn. End your turn." };
  });
}

export function listProposals() {
  return store.listProposals().map(({ record, files }) => ({ track: record.track, digest: record.digest, created: record.created, files }));
}

/**
 * Installs a proposal only if its files still have the digest the learner consented to. `onProgress` hears each
 * install step as counts, then the probes; never the install's output.
 */
export async function installProposal(ref: string, digest: string, onProgress?: (p: TrackProgress) => void): Promise<{ installed: string; unchanged?: true }> {
  const { id, version } = store.parseTrackRef(ref);
  return store.withLock(store.trackLockPath(id), async () => {
    const files = store.readProposal(ref, digest);
    const read = files && store.fileMapDigest(files) === digest ? readTrackSpec(files) : undefined;
    if (!files || read?.ref !== ref) {
      throw new CodeLearnError(`The proposal for ${ref} changed or is gone, so it needs the learner's consent again.`);
    }
    if (alreadyInstalled(ref, version, files)) {
      store.dropProposals(ref);
      return { installed: ref, unchanged: true as const };
    }
    const result = await install(ref, files, quietly(onProgress));
    store.dropProposals(ref);
    return result;
  });
}

export async function dropProposal(ref: string): Promise<void> {
  await store.withLock(store.trackLockPath(store.parseTrackRef(ref).id), async () => store.dropProposals(ref));
}

/**
 * Installs a track's toolchain again and re-runs every gate before trusting it (DESIGN §4.6): the track's probes,
 * then every stored exercise on it. Only then does the new toolchain replace the installed one; otherwise nothing
 * changes.
 */
export async function rebuildTrack(ref: string): Promise<{ rebuilt: string; exercises: number }> {
  const old = installedTrack(ref);
  return store.withLock(store.trackLockPath(old.id), async () => {
    const { staged } = await verifyTrack(store.readTrackFiles(ref), undefined, { rebuild: true });
    let count: number;
    try {
      count = await recheckExercises(ref, old, staged);
    } catch (e) {
      staged.remove();
      throw e;
    }
    commitToolchain(staged, ref);
    store.writeTrackRecord(ref, { ...old, toolchain: { ...old.toolchain, resolved: staged.resolved } });
    return { rebuilt: ref, exercises: count };
  });
}

/**
 * Re-runs exercise gates 2 to 6 for every stored exercise on `track`, on the staged toolchain: io outputs must equal the
 * stored ones and unit inventories must match. Returns how many there were, or fails listing the ones that changed.
 */
async function recheckExercises(ref: string, track: TrackRecord, staged: StagedToolchain): Promise<number> {
  const folders: ToolchainFolders = staged.folders;
  const changed: string[] = [];
  let count = 0;
  for (const courseId of store.listCourses()) {
    const course = store.readCourse(courseId);
    if (!course) continue;
    for (const ex of store.listExercises(courseId)) {
      // A quiz runs nothing on a track.
      if (ex.style === "quiz" || ex.track !== ref) continue;
      count += 1;
      const { files } = store.readExercise(courseId, ex.slug);
      try {
        // In the exercise's own style: a course whose activities are off keeps its track and its exercises.
        const again = await verifyExercise(track, { ...course, track: ref, style: ex.style }, files, new Set(), undefined, [], folders);
        if (JSON.stringify(digests(again.expected)) !== JSON.stringify(digests(ex.expected)) || JSON.stringify(again.inventory) !== JSON.stringify(ex.inventory)) {
          changed.push(`${courseId}/${ex.slug}: results changed`);
        }
      } catch (e) {
        // This computer's sandbox, disk or network failing isn't the toolchain behaving differently.
        if (e instanceof CodeLearnError && (e.kind === "sandbox" || e.kind === "disk" || e.kind === "offline")) throw e;
        changed.push(`${courseId}/${ex.slug}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }
  if (changed.length > 0) throw new CodeLearnError(`The rebuilt toolchain behaves differently, so it wasn't accepted:\n${changed.join("\n")}`);
  return count;
}
