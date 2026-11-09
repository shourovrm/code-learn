import { rmSync } from "node:fs";
import { CodeLearnError } from "../errors.js";
import * as store from "../store.js";

// ---------- courses ----------

/** The longest course name: a roadmap's title takes at most as much (schemas.ts). */
const TITLE_MAX = 60;

/** The course's record. Checked before any lock, since taking a course's lock makes its folder. */
function existingCourse(course: string) {
  const record = store.readCourse(course);
  if (!record) throw new CodeLearnError(`No course "${course}".`, "no-course");
  return record;
}

/** The title of each course that uses the track, or the course's id when it has no title. */
export function courseNamesOnTrack(ref: string): string[] {
  return store.listCourses().flatMap((id) => {
    const course = store.readCourse(id);
    return course?.track === ref ? [course.title ?? id] : [];
  });
}

export async function renameCourse(course: string, title: string): Promise<{ course: string; title: string }> {
  const name = title.trim();
  if (name === "") throw new CodeLearnError("A course needs a name.");
  if (name.length > TITLE_MAX) throw new CodeLearnError(`A course name can be at most ${TITLE_MAX} characters.`);
  existingCourse(course);
  return store.withLock(store.courseLockPath(course), async () => {
    store.writeCourse({ ...existingCourse(course), title: name });
    return { course, title: name };
  });
}

/**
 * Deletes a course: its folder (roadmap, lessons, exercises, attempts and mastery), its exercise files in the workspace,
 * and the workspace's pointers to it. The course's toolchain stays installed. Takes the workspace lock, then the course
 * lock, the order updateWorkspace documents.
 */
export async function deleteCourse(ws: string, course: string): Promise<{ deleted: string }> {
  existingCourse(course);
  await store.updateWorkspace(ws, async (config) => {
    // Refuses a symlink in the way before anything is removed.
    const files = store.refuseSymlinks(ws, `exercises/${course}`);
    await store.withLock(store.courseLockPath(course), async () => {
      existingCourse(course);
      store.removeCourseRecord(course);
    });
    rmSync(files, { recursive: true, force: true });
    return config.course === course ? { ...config, course: undefined, current: undefined } : config;
  });
  return { deleted: course };
}
