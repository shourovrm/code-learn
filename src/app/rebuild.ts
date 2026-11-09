import { CodeLearnError } from "../errors.js";
import * as store from "../store.js";
import { learnerDir } from "./shared.js";

// ---------- rebuild ----------

/** The chosen topics must be in the course's roadmap, and there must be at least one. */
function assertTopics(course: string, concepts: string[]): void {
  if (concepts.length === 0) throw new CodeLearnError("Pick at least one topic to rebuild.");
  const record = store.readCourse(course);
  if (!record) throw new CodeLearnError(`No course "${course}".`, "no-course");
  for (const concept of concepts) {
    if (!record.concepts.some((c) => c.id === concept)) throw new CodeLearnError(`"${concept}" is not in the roadmap for ${course}.`);
  }
}

/**
 * Rebuilds some topics so the agent writes their lessons and exercises again. With `replace`, the topics' lessons go,
 * and so do the exercises that cover only chosen topics, with the learner's files for them. The log is never edited:
 * a rebuild event restarts those topics' progress from there. Without `replace`, nothing changes; the new lessons and
 * exercises sit beside the old ones under new ids. Removed ids are never reused, since their events stay in the log.
 */
export async function rebuildTopics(ws: string, course: string, concepts: string[], { replace }: { replace: boolean }): Promise<void> {
  assertTopics(course, concepts);
  if (!replace) return;
  const chosen = new Set(concepts);
  await store.withLock(store.courseLockPath(course), async () => {
    for (const lesson of store.listLessons(course)) {
      if (chosen.has(lesson.concept)) store.discard(store.lessonDir(course, lesson.id));
    }
    for (const exercise of store.listExercises(course)) {
      const onlyChosen = exercise.concepts.length > 0 && exercise.concepts.every((c) => chosen.has(c));
      if (!onlyChosen) continue;
      store.discard(store.exerciseDir(course, exercise.slug));
      store.discard(store.refuseSymlinks(ws, learnerDir(course, exercise.slug)));
    }
    store.appendEvent(course, { format_version: 1, kind: "rebuild", at: new Date().toISOString(), concepts: [...chosen] });
  });
}
