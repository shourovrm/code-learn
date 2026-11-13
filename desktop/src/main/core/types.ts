import type { CheckProgress, ExerciseStatus } from '../../shared/api';
// The core `app` functions the desktop calls in-process (DESIGN §2), with the
// shapes it relies on. coreApp.test.ts checks the bundled core against them.

export type TestStatus = 'pass' | 'fail' | 'error';

/** core app.ts CheckView: visible results in full, hidden ones named `hidden #n` with `index` n and a status only. */
export interface CoreCheckView {
  exercise: string;
  passed: number;
  total: number;
  tests: { name: string; status: TestStatus; message?: string; actual?: string; index?: number }[];
  recorded: boolean;
  note?: string;
}

export interface CoreExercise {
  course: string;
  exercise: string;
  /** An absolute path: never shown (D15). */
  path: string;
  style: 'io' | 'unit' | 'quiz';
  questions?: { text: string; choices: { text: string }[] }[];
  concepts: string[];
  difficulty: number;
  files: string[];
  statement: string;
  hint?: string;
  visibleTests: { name: string; input?: string; expected?: string }[];
  /** The track's run command, for io exercises. */
  run?: string;
}

export interface CoreRoadmap {
  course: string;
  /** The course's name, as the agent wrote it (core §5); older roadmaps have none. */
  title?: string;
  goal: string;
  track?: string;
  style: string;
  concepts: { id: string; title: string; requires: string[]; practice?: string; pitfalls?: string[]; refs?: number[] }[];
  /** The roadmaps and docs the research job used (core §5): https links only. */
  sources?: { title: string; url: string }[];
  /** Why code practice fits this subject poorly, and the practice that fits better (research agent's note). */
  practice_note?: string;
}

export type CoreNextStep =
  | { kind: 'learn'; concept: string; lesson: string | null }
  | { kind: 'practice'; exercise: string; concept: string; lesson?: string | null }
  | { kind: 'author'; concept: string; difficulty: number; lesson?: string | null; review?: true }
  | { kind: 'review'; concept: string; difficulty: number; exercise: string }
  | { kind: 'setup'; track: string }
  | { kind: 'stuck'; concept: string }
  | { kind: 'done' };

export interface CoreProgress {
  course: string;
  goal: string;
  track?: string;
  style: string;
  /** `reviewDue`: when a mastered concept's next review is due (core §7). */
  concepts: { id: string; title: string; requires: string[]; mastery: number; mastered: boolean; covered: boolean; attempts: number; stuck: boolean; reviewDue?: string }[];
  next: CoreNextStep;
}

export interface CoreLesson {
  id: string;
  concept: string;
  title: string;
  markdown: string;
  /** What the learner will be able to do, shown above the text. Absent on an `outdated` lesson. */
  goal?: string;
  /** Self-check questions, shown after the text with each answer closed until asked. Absent on an `outdated` lesson. */
  selfCheck?: { question: string; answer: string }[];
  /** The sources the concept's research named, from the roadmap. */
  sources: { title: string; url: string }[];
  /** Saved when a lesson's goal and self-check were fixed headings in its text: rebuilding its topic rewrites it. */
  outdated?: boolean;
  notes: string;
  /** Runnable examples: file maps that follow the track's contract. */
  examples: Record<string, string>[];
  /** How the examples run, when there are any: io ones take typed input, unit ones run as tests. */
  style?: 'io' | 'unit';
}

/** core judge.ts ProgramRun: a running program. `write` is false when the input wasn't taken. */
export interface CoreProgramRun {
  write(text: string): boolean;
  /** Closes the program's input; nothing once it ended. */
  end(): void;
  kill(): void;
  done: Promise<{ exit: number; stage?: 'build' | 'run'; timedOut: boolean; flooded: boolean; stopped?: boolean; outOfMemory?: boolean }>;
}

/** A file a sync brought in, by its path in the sync folder; without `text`, deleted. `was` is a log as exported. */
export interface CoreSyncChange {
  path: string;
  text?: string;
  was?: string;
}

export interface CoreApp {
  /** core templates.ts: one brief per agent job, the same text the terminal uses. */
  JOB_BRIEFS: Record<'research' | 'review' | 'roadmap' | 'setup' | 'lesson' | 'author' | 'tutor', string>;
  /** core sandbox.ts: why sandboxes can't run here (a code and a message), or undefined when they work. */
  sandboxDown(): Promise<{ code: string; message: string; help: string } | undefined>;
  /** core doctor.ts: the isolation self-test, run in the same sandbox a check gets. */
  isolation(): Promise<{ name: string; ok: boolean; detail: string; kind?: 'offline' | 'disk' | 'sandbox' }>;
  readWorkspace(ws: string): { course?: string; current?: string };
  /** An exercise's solution, mutants, hidden tests and hidden expected outputs, for the reply filter only. */
  hiddenMaterial(course: string, slug: string): string[];
  /** `track` is `id@version`. */
  listTracks(): { track: string; styles: string[]; files: string[] }[];
  /** Removes an installed track and its toolchain folder; core refuses while a course uses it. */
  removeTrack(ref: string): Promise<{ removed: string }>;
  /** core courses.ts: the title of each course that uses a track (its id for a course without one). */
  courseNamesOnTrack(ref: string): string[];
  renameCourse(course: string, title: string): Promise<{ course: string; title: string }>;
  /** Deletes a course's folder, its exercise files and the workspace's pointers to it (core courses.ts). */
  deleteCourse(ws: string, course: string): Promise<{ deleted: string }>;
  rebuildTrack(ref: string): Promise<unknown>;
  saveRoadmap(ws: string, course: string, yaml: string, bound?: string, activate?: boolean): Promise<{ course: string }>;
  progress(ws: string, bound?: string): CoreProgress;
  /** Sandbox scopes whose owning code-learn process is gone are stopped (doctor --fix's rule). Added by scripts/core-entry.ts. */
  cleanupLeftovers(): Promise<void>;
  getExercise(ws: string, slug?: string, bound?: string): Promise<CoreExercise>;
  testExercise(ws: string, slug?: string, bound?: string, onProgress?: (p: CheckProgress) => void): Promise<CoreCheckView>;
  checkExercise(ws: string, slug?: string, bound?: string, onProgress?: (p: CheckProgress) => void): Promise<CoreCheckView>;
  exerciseStatus(ws: string, slug: string, bound?: string): ExerciseStatus;
  /** A code exercise's solution, learner files only, once its checks open it. Rejects until then (core DESIGN A5). */
  getSolution(ws: string, slug: string, bound?: string): Promise<{ exercise: string; files: Record<string, string> }>;
  skip(ws: string, concept: string, bound?: string): Promise<void>;
  assertRuntime(): Promise<void>;
  getRoadmap(ws: string, bound?: string): CoreRoadmap;
  listProposals(): { track: string; digest: string; created: string; files: Record<string, string> }[];
  /**
   * `onProgress` hears each install step as counts, then the probes: never the installer's output (core §4.4, §4.6).
   */
  installProposal(ref: string, digest: string, onProgress?: (p: { phase: 'building'; done: number; total: number } | { phase: 'checking' }) => void): Promise<unknown>;
  dropProposal(ref: string): Promise<void>;
  getLesson(ws: string, id: string, bound?: string): CoreLesson;
  /**
   * Run: the current exercise's program with typed input, streamed, time-limited, never recorded. io tracks only.
   * `done` rejects only on an infrastructure failure.
   */
  runInteractive(ws: string, slug: string | undefined, bound: string | undefined, output: (text: string, stream: 'stdout' | 'stderr') => void, options?: { onStart?: (stage: 'build' | 'run', limitMs: number) => void }): Promise<CoreProgramRun>;
  /** Run for a lesson's io example: like runInteractive, on the example's files. Never recorded. */
  runExampleLive(ws: string, lessonId: string, index: number, bound: string | undefined, output: (text: string, stream: 'stdout' | 'stderr') => void, options?: { onStart?: (stage: 'build' | 'run', limitMs: number) => void }): Promise<CoreProgramRun>;
  /** Runs a saved lesson example in the sandbox; output and errors are capped. Never recorded. */
  runExample(ws: string, lessonId: string, index: number, bound?: string): Promise<{ exit: number; output: string; errors: string }>;
  /** Rebuilds the chosen topics: with `replace`, their lessons and the exercises only they cover go, and progress resets (core §5). */
  rebuildTopics(ws: string, course: string, concepts: string[], options: { replace: boolean }): Promise<void>;
  listLessons(ws: string, bound?: string): { id: string; concept: string; title: string; read: boolean }[];
  /** Copies what syncs to GitHub into `dest/home` and `dest/workspace`, each part under its lock (core sync). */
  exportForSync(ws: string, dest: string): Promise<void>;
  /** Writes or deletes the files a sync brought in, under their locks; refuses any path that doesn't sync. */
  importFromSync(ws: string, changes: CoreSyncChange[]): Promise<void>;
  /** A course's event log changed on two computers: the shared lines, then both sides' new ones in time order. */
  mergeLog(base: string, ours: string, theirs: string): string;
  /** Lesson notes written on two computers: this computer's, then the other's under its name. */
  mergeNotes(ours: string, theirs: string, from: string): string;
  listExercises(ws: string, bound?: string): { exercise: string; concepts: string[]; difficulty: number; created: string }[];
  saveNotes(ws: string, id: string, text: string, bound?: string): Promise<void>;
  markLessonRead(ws: string, id: string, bound?: string): Promise<void>;
  readLearnerFiles(ws: string, slug: string, bound?: string): Record<string, { text: string; digest: string }>;
  writeLearnerFile(ws: string, slug: string, path: string, text: string, digest: string, bound?: string): Promise<{ digest: string }>;
}
