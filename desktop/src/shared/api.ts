// The IPC contract (docs/desktop/DESIGN.md §2, D3): every call the renderer can
// make, and the learner-safe views it gets back. Main validates each call's
// input (src/main/ipc.ts) and answers with one function. Nothing here may
// carry a solution, mutant, hidden test, expected hidden output, author
// transcript, tool argument or agent stderr (§2.2, D4). The one exception is `solution`, the learner's own view of a
// solution once its checks open it (DESIGN A5).

// ---------- errors ----------

/**
 * A failed call rejects with an Error whose message holds one of these codes.
 * None of them records anything.
 */
export const SIGNED_OUT = 'code-learn:signed-out';
export const NO_AGENT = 'code-learn:no-agent';
export const PLAN_LIMIT = 'code-learn:plan-limit';
/** This computer couldn't reach the network: the agent's service, or a build's downloads. */
export const OFFLINE = 'code-learn:offline';
/** An agent job failed or wasn't done by its check (§5). */
export const AGENT_FAILED = 'code-learn:agent-failed';
/** A damaged code-learn record. The message's next lines are core's repair guidance (§5). */
export const REPAIR = 'code-learn:repair';
/** A cancel the agent's process group survived: "code-learn couldn't stop your agent" (§3.1). */
export const UNSTOPPABLE = 'code-learn:unstoppable';
/** Why a check wasn't counted when a track's toolchain is missing: the fix is under Toolchains, not this computer (§5). */
export const REBUILD = 'This environment needs a rebuild. Rebuild it under Toolchains.';
/** Why a run wasn't counted, or didn't run, when this computer caused it (notCounted.ts). */
export const NOT_COUNTED = {
  sandbox: "code-learn's sandbox couldn't run that.",
  // The check's own deadline (core check-timeout): every case had its limit, so only a busy computer gets here.
  'sandbox-busy': 'This computer was too busy to finish in time.',
  disk: 'This computer is out of disk space.',
  offline: "code-learn couldn't reach the network.",
} as const;
/** Run and lesson examples have no recovery screen, so their line says what to do next (§4.10). */
export const RUN_AGAIN: Record<string, string> = {
  [NOT_COUNTED.sandbox]: 'Check this computer under Settings, then run again.',
  [NOT_COUNTED['sandbox-busy']]: 'Wait a moment, then run again.',
  [NOT_COUNTED.disk]: 'Free some space, then run again.',
  [NOT_COUNTED.offline]: 'Connect to the internet, then run again.',
};
/** A run that didn't run: why, then what to do next. */
export const notRunLine = (reason: string) => (RUN_AGAIN[reason] ? `${reason} ${RUN_AGAIN[reason]}` : reason);
/** A learner file changed outside code-learn since the editor loaded it (§4.5). */
export const CHANGED = 'code-learn:changed';

// ---------- connect (§3.1, §3.3) ----------

export type AgentId = 'claude' | 'codex' | 'cursor' | 'pi';

/** `missing`: not installed. `signed-out`: installed, but its sign-in check failed. */
export type AgentState = 'connected' | 'not-connected' | 'missing' | 'signed-out';

/** A bench-tested model the learner may choose for an agent (O6). */
export interface ModelChoice {
  /** What the agent's CLI takes: `--model` for Claude Code, `-m` for Codex. */
  id: string;
  label: string;
  recommended: boolean;
}

export interface Agent {
  id: AgentId;
  name: string;
  state: AgentState;
  installUrl: string;
  /** The bench-tested models, from models.json; empty for an agent with no choice. */
  models: ModelChoice[];
  /** The model every job for this agent runs: the learner's choice, or the recommended one. */
  model: string | null;
  /** The installed CLI version isn't one code-learn was tested with. It may still work. */
  untested: boolean;
  experimental: boolean;
  /** code-learn can install this agent here, the vendor's own way (macOS and Windows; Claude Code and Codex). */
  canInstall: boolean;
  /** An install code-learn started, while it runs and after it ends. */
  install?: AgentInstall;
}

/**
 * code-learn installing an agent for the learner. Problems: `offline` and `disk` are this computer's; `unverified`:
 * the download didn't match the vendor's checksum or signature, so nothing ran (or, for a script's result, it isn't
 * used); `failed`: the vendor's installer didn't finish.
 */
export interface AgentInstall {
  phase: 'downloading' | 'checking' | 'installing' | 'done' | 'failed';
  /** 0 to 1 while downloading. */
  progress?: number;
  problem?: 'offline' | 'disk' | 'unverified' | 'failed';
}

// ---------- check this computer (§6.1, core §4.6) ----------

/** `sandbox`: bubblewrap and the systemd user session; `isolation`: core doctor's self-test from inside a sandbox. */
export type CheckId = 'sandbox' | 'isolation';

export interface ComputerCheck {
  id: CheckId;
  /** `waiting`: an earlier check has to pass first. */
  state: 'ok' | 'problem' | 'waiting';
  /** For a problem: core's own words, which end with what to do. */
  reason?: string;
  /**
   * For a missing bubblewrap: the command that installs it on this distribution, for the learner to run in a terminal.
   * code-learn runs nothing as root.
   */
  installCommand?: string;
}

export interface Computer {
  checks: ComputerCheck[];
  ready: boolean;
}

// ---------- roadmap (§4.2) ----------

/** How the learner practises: graded code, quizzes, both (core style `both`), or lessons only (core style `none`). */
export type Practice = 'code' | 'quiz' | 'both' | 'none';

/** How deep the roadmap goes, as the learner chose: about 8, 15 or 25 to 30 single-skill topics. */
export type Depth = 'overview' | 'standard' | 'in-depth';

export interface Goal {
  topic: string;
  /** What the learner says they already know, in their words. */
  known: string;
  /** How the learner wants the course made, in their words. Optional: a goal from the tracks screen has none. */
  instructions?: string;
  depth: Depth;
  practice: Practice;
}

export interface Concept {
  id: string;
  title: string;
  requires: string[];
}

export interface Roadmap {
  /** The course's name: the words typed for a course from before titles (W-5), else the agent's title, else the goal. */
  title: string;
  /** The goal the agent wrote, shown under the name when they differ. */
  goal: string;
  /** The track's display name, from list_tracks or the agent's proposal. */
  track: string;
  installed: boolean;
  activities: boolean;
  concepts: Concept[];
  /** The roadmaps and docs the agent used. Opened only in the system browser (§2.1). */
  sources: { title: string; url: string }[];
}

export type JobState = 'running' | 'done' | 'failed';

/** The research job writes the roadmap; poll until it's done. */
export interface Research {
  state: JobState;
  roadmap?: Roadmap;
}

export interface RoadmapChange {
  roadmap: Roadmap;
  changed: boolean;
  /** The agent's reply, shown when nothing changed. */
  text: string;
}

// ---------- course (§3.2, §4.1, §4.3, §4.4) ----------

/**
 * `proposing`: the setup job is writing a proposal. `consent`: waiting for the
 * learner. `installing`: building the approved proposal.
 */
export type SetupState = 'proposing' | 'consent' | 'installing' | 'ready' | 'failed';
/**
 * Why setup failed. `gates` means the proposals didn't pass; the rest are this computer's problems: the sandbox, the
 * disk or the network.
 */
export type SetupProblem = 'offline' | 'disk' | 'sandbox' | 'gates';

/** What the learner approves before setup: exactly the files code-learn will build (§4.1). */
export interface Proposal {
  digest: string;
  /** True when an earlier proposal failed its gates: "code-learn has another way". */
  retry: boolean;
  /** On a retry, why the last proposal failed, in code-learn's words (never its output). */
  why?: string;
  files: { path: string; text: string }[];
}

export type TopicState = 'covered' | 'mastered' | 'now' | 'later';
/** `failed`: the job writing it stopped, and the learner tries again (§5). */
export type LessonState = 'writing' | 'failed' | 'ready' | 'read';
export type ActivityState = 'none' | 'writing' | 'locked' | 'open' | 'passed';

export interface TopicView {
  id: string;
  title: string;
  state: TopicState;
  /** 0 to 1. */
  mastery: number;
  stuck: boolean;
  lessons: { id: string; title: string; state: LessonState }[];
  activity: ActivityState;
  /** A mastered topic due for review: its review activity is open, or being written. */
  review?: 'due' | 'writing';
  /** Whole days until a mastered topic's next review, when one is scheduled and not yet due. */
  reviewIn?: number;
}

export interface CourseView {
  /** The course's name (as Roadmap's): the map's heading, with the goal under it when they differ. */
  title: string;
  goal: string;
  track: string;
  setup: SetupState;
  activities: boolean;
  setupProblem?: SetupProblem;
  proposal?: Proposal;
  topics: TopicView[];
  done: boolean;
  /** Background work (setup, lessons, activities) stopped after its retry, and why (§5). Nothing was recorded. */
  stalled?: 'plan-limit' | 'signed-out' | 'offline' | 'sandbox' | 'disk' | 'rebuild' | 'lesson' | 'failed' | 'unstoppable';
  /** The background work that stalled, so its banner can name it. */
  stalledWork?: 'setup' | 'lesson' | 'author';
  /**
   * The topic whose activity couldn't be written, when leaving it for later opens another topic: its banner offers
   * "Come back later", which unlocks the topics after it without mastering it (core §7).
   */
  later?: string;
}

/** One of the learner's courses, to switch to (§4.13). The id is opaque and never shown. */
export interface CourseSummary {
  id: string;
  title: string;
  /** Names the course when another has the same title. */
  goal: string;
  track: string;
  /** The course on screen. */
  current: boolean;
  /** How the course is practised: Code, Quiz, or lessons only (`none`). */
  practice: Practice;
}

export interface Lesson {
  id: string;
  concept: string;
  title: string;
  /** Static Markdown, rendered with raw HTML stripped (§2.1). It places example N as a fenced block `example` holding N. */
  markdown: string;
  notes: string;
  /** Runnable examples, in order: each runs in the sandbox on request and is never recorded (§4.3). */
  examples: { files: { path: string; text: string }[] }[];
  /** How the examples run: io ones in the terminal pane with typed input (runExampleLive), unit ones once as tests. */
  style?: 'io' | 'unit';
}

/** One run of a lesson example (output capped by core), or why it didn't run (this computer, §6.1). */
export type ExampleRun = { kind: 'ran'; exit: number; output: string; errors: string } | { kind: 'not-run'; reason: string };

// ---------- activity (§4.5, D11) ----------

export interface LearnerFile {
  path: string;
  text: string;
  digest: string;
}

export interface VisibleTest {
  name: string;
  input?: string;
  expected?: string;
}

interface ActivityBase {
  id: string;
  concept: string;
  title: string;
  /** Markdown. */
  statement: string;
  visibleTests: VisibleTest[];
  files: LearnerFile[];
  /** The track's run command, for io activities only: they have Run. */
  run?: string;
}

export type QuizQuestion = { text: string; choices: { text: string }[] };
export type Activity = ActivityBase & (
  | { style?: 'io' | 'unit'; questions?: never }
  | { style: 'quiz'; questions: QuizQuestion[] }
);

/** What Run's program printed, or a stage starting with its time limit, for the countdown. */
export type RunOutput = { run: string; stream: 'stdout' | 'stderr'; text: string } | { run: string; started: 'build' | 'run'; limitMs: number };

/**
 * How Run ended. Never recorded. `exit` is the program's own code. `stopped`: the learner stopped it.
 * `timedOut`: its time limit did. `flooded`: it printed too much. `not-run`: code-learn couldn't run it.
 */
export type RunResult =
  | { kind: 'ran'; exit: number; stage?: 'build' | 'run'; timedOut: boolean; stopped: boolean; flooded: boolean; outOfMemory: boolean }
  | { kind: 'not-run'; reason: string };

export type TestStatus = 'pass' | 'fail' | 'error';

/**
 * Progress through Try it or Check: a phase and counts. `total` 0 means not counted (hidden and unit tests).
 * A visible io test also arrives with its result as it finishes; nothing about a hidden test ever does.
 */
export interface CheckProgress {
  /** The run it belongs to: the id the renderer passed to tryIt or check. */
  run?: string;
  phase: 'building' | 'visible' | 'hidden';
  done: number;
  total: number;
  test?: FinishedTest;
}

/** A visible io test's result as it finishes: its name (`visible/01`), status, message and what the program printed. */
export interface FinishedTest {
  name: string;
  status: TestStatus;
  message?: string;
  actual?: string;
}

/** One test result. A hidden test has no name or detail: an index and a status only. */
export type TestView =
  | { hidden: false; name: string; status: TestStatus; message?: string; actual?: string }
  | { hidden: true; index: number; status: TestStatus };

export type CheckResult =
  | {
      kind: 'graded';
      passed: number;
      total: number;
      tests: TestView[];
      /** False for an unedited starter or a quiz that already has a recorded check (core §7). */
      recorded: boolean;
      note?: string;
      stuck: boolean;
      mastered: boolean;
      /** Another topic is ready, so "Come back later" moves on (§4.4). */
      later: boolean;
    }
  /** An infrastructure failure: nothing was recorded. */
  | { kind: 'not-counted'; reason: string };

/** Try it: visible tests only, never recorded. */
/** An exercise's recorded checks (core §7, DESIGN A5): what Solution, the solved card and Results' last line show. */
export interface ExerciseStatus {
  /** Recorded checks, passed or failed. */
  checks: number;
  /** The first recorded check that passed, when there is one. */
  solved?: { at: string; passed: number; total: number };
  /** How many recorded checks open the solution without a pass. */
  solutionChecks: number;
  solutionOpen: boolean;
  last?: { passed: number; total: number; at: string };
}

export type TryResult = { kind: 'ran'; passed: number; total: number; tests: TestView[] } | { kind: 'not-counted'; reason: string };

/** What the agent CLIs reported using (§4.12). `costUsd` is Claude's own estimate; Codex and Cursor report none. */
export interface UsageTotals {
  input: number;
  output: number;
  cachedInput: number;
  costUsd: number;
  runs: number;
}

/** A course's usage per job kind, and in total. */
export interface CourseUsage {
  kinds: Partial<Record<'research' | 'review' | 'roadmap' | 'setup' | 'lesson' | 'author' | 'tutor', UsageTotals>>;
  total: UsageTotals;
}

/** The course on screen's usage. */
export type Usage = CourseUsage;

/**
 * A new version (DESIGN §7.2). `available`: an unsigned build, with the release's page. `downloading`, then
 * `ready`: a signed build, which offers Restart to update.
 */
export type UpdateStatus =
  | { kind: 'none' }
  | { kind: 'available'; version: string; url: string }
  | { kind: 'downloading'; version: string }
  | { kind: 'ready'; version: string };

export type Place = { lessonId: string } | { activityId: string };

export interface Message {
  from: 'you' | 'code-learn';
  text: string;
}

export interface Track {
  ref: string;
  name: string;
  /** The titles of the courses that use it. Empty: the learner can remove it. */
  usedBy: string[];
}

export interface CodeLearnApi {
  agents(): Promise<Agent[]>;
  /** Chooses the agent and runs its sign-in check. */
  connect(agent: AgentId): Promise<Agent>;
  /** Installs a missing agent the vendor's own way; follow it with agents(). */
  installAgent(agent: AgentId): Promise<void>;
  /** Starts the agent's own sign-in where the learner sees it; the next agents() after they sign in shows it. */
  signIn(agent: AgentId): Promise<void>;
  /** Chooses the model for an agent's jobs, one of its `models`. */
  chooseModel(agent: AgentId, model: string): Promise<Agent>;
  /** Hears progress while Try it or Check runs; returns a function that stops listening. An event, not a call. */
  onCheckProgress(listener: (progress: CheckProgress) => void): () => void;
  /** Hears every agent job's progress while it runs; returns a function that stops listening. An event, not a call. */
  onJobProgress(listener: (progress: JobProgress) => void): () => void;
  /** The jobs running now, for a screen that opens while one runs; onJobProgress follows them. */
  jobProgress(): Promise<JobProgress[]>;
  /** Hears what Run's programs print; returns a function that stops listening. An event, not a call. */
  onRunOutput(listener: (output: RunOutput) => void): () => void;
  computer(): Promise<Computer>;
  tracks(): Promise<Track[]>;
  /** Removes an installed track and its toolchain folder (core removeTrack); refused while a course uses it. */
  removeTrack(trackRef: string): Promise<void>;

  /** Starts the research job on the first call; call again to follow it. */
  research(goal: Goal): Promise<Research>;
  /** Saves the learner's edits, then runs a roadmap-change job. */
  reviseRoadmap(concepts: Concept[], request: string): Promise<RoadmapChange>;
  /** Saves the roadmap, which becomes one of the learner's courses, on screen. If its track isn't installed, starts the setup job. */
  approve(concepts: Concept[]): Promise<void>;
  /** The roadmap written or edited but not approved yet, to resume. The approved course stays the course until then. */
  draft(): Promise<Roadmap | null>;
  /** Saves the learner's edits to the draft as they happen. */
  saveDraft(concepts: Concept[]): Promise<void>;

  course(): Promise<CourseView | null>;
  /** The learner's courses, oldest first, with the one on screen marked (§4.13). */
  courses(): Promise<CourseSummary[]>;
  /** Puts another of the learner's courses on screen; the work it still needs starts. */
  switchCourse(course: string): Promise<void>;
  /** Gives a course another name; the title is trimmed and at most LIMITS.courseTitle characters. */
  renameCourse(course: string, title: string): Promise<void>;
  /** Deletes a course and its exercise files; its toolchain stays installed. Refused while work on that course runs. */
  deleteCourse(course: string): Promise<void>;
  setActivities(on: boolean): Promise<void>;
  /** Builds the proposal the learner saw. Also retries after an offline or low-disk failure. */
  install(digest: string): Promise<void>;
  /** Runs the setup job again, after its proposals failed their gates. */
  retrySetup(): Promise<void>;
  /** Starts the stalled background work of the course on screen again. */
  retryJobs(): Promise<void>;

  lesson(id: string): Promise<Lesson>;
  saveNotes(lessonId: string, notes: string): Promise<void>;
  markRead(lessonId: string): Promise<void>;

  /** The current activity for a concept. */
  activity(concept: string): Promise<Activity>;
  /** Saves one learner file. Rejects with CHANGED if it changed since `digest`. Returns the new digest. */
  saveFile(activityId: string, path: string, text: string, digest: string): Promise<string>;
  /** `run` tags this run's progress events, so the renderer hears only its own. */
  tryIt(activityId: string, run?: string): Promise<TryResult>;
  /** Runs a lesson's example `index` (from 1) in the sandbox. Never recorded. */
  runExample(lessonId: string, index: number): Promise<ExampleRun>;
  /** Run for a lesson's io example `index`, as runProgram is for an activity: typed input, output through onRunOutput. */
  runExampleLive(lessonId: string, index: number, run: string): Promise<RunResult>;
  check(activityId: string, run?: string): Promise<CheckResult>;
  /** The exercise's recorded checks: whether it's solved, and whether its solution is open to the learner. */
  exerciseStatus(activityId: string): Promise<ExerciseStatus>;
  /** A code exercise's reference solution, read-only, once `exerciseStatus` says it's open. Rejects until then. */
  solution(activityId: string): Promise<{ path: string; text: string }[]>;
  /**
   * Run: the learner's program with typed input, time-limited, never recorded. Resolves when it ends; what it prints
   * arrives through onRunOutput, tagged with `run`, and only in the window that started it.
   */
  runProgram(activityId: string, run: string): Promise<RunResult>;
  /** Typed input for a Run this window started. False if it wasn't taken: the run ended, or too much is waiting. */
  sendRunInput(run: string, text: string): Promise<boolean>;
  /** Ends a Run's input, as Ctrl+D does in a terminal, so a program that reads until the end can finish. */
  endRunInput(run: string): Promise<void>;
  /** Stops a Run this window started. */
  stopRun(run: string): Promise<void>;

  /** A tutor turn. A reply that shows hidden material is held back (§2.2). */
  ask(place: Place, text: string): Promise<Message[]>;
  /** "Come back later": defers the concept without changing mastery (§4.4). */
  skip(concept: string): Promise<void>;
  /** "Try an easier one": a roadmap-change job that adds a prerequisite topic (§3.2). */
  easier(concept: string): Promise<void>;
  /**
   * Rebuilds the chosen topics of the open course: their lessons and exercises are written again. `replace` removes the
   * old ones and resets their progress; without it the new ones sit beside the old (core §5, desktop §4.3).
   */
  rebuildTopics(concepts: string[], replace: boolean): Promise<void>;

  rebuild(trackRef: string): Promise<void>;

  /** What the agent CLIs reported using for the current course (§4.12); null without a course. */
  usage(): Promise<Usage | null>;
  /** Whether a new version is out (§7.2). */
  update(): Promise<UpdateStatus>;
  /** Quits and installs a downloaded update: a signed build whose update is `ready`. */
  restartToUpdate(): Promise<void>;
}

/** One thing a job did: a web search, an https page (host and path) or one of code-learn's steps (§4.11). */
export type JobStep = { kind: 'search'; query: string } | { kind: 'read'; url: string } | { kind: 'step'; label: string };

/** The agent jobs (§3.2): research, review, a roadmap change, setup, a lesson, an activity (author) and a tutor turn. */
export type AgentJobKind = 'research' | 'review' | 'roadmap' | 'setup' | 'lesson' | 'author' | 'tutor';

/** Everything that reports progress (§4.11): the agent jobs, and code-learn's own rebuild of a track. */
export type JobKind = AgentJobKind | 'rebuild';

/**
 * A running job's progress (§4.11): its stage (an index into JOB_STAGES[kind]), its latest steps and how long it has
 * run. Never a file path, a file's contents, a hidden test or anything else from code-learn's records.
 */
export interface JobProgress {
  /** This run of the job, an opaque id: a new run starts fresh. */
  job: string;
  kind: JobKind;
  /** The topic a lesson or author job writes for. */
  concept?: string;
  /** The track's name (not its ref), for a rebuild. */
  track?: string;
  stage: number;
  /** The latest steps, newest first, at most 8. */
  steps: JobStep[];
  /** How many steps so far. */
  count: number;
  /** A real fraction within the stage: a setup's build steps, or which of the exercise's 3 gates runs. */
  part?: { done: number; total: number };
  /** "Trying again": attempt 2 of 3 after a failed save, or 2 of 2 after a relaunch. */
  retry?: { attempt: number; of: number };
  /** False while one of code-learn's own tools runs: then the agent is waiting, not thinking. */
  thinking: boolean;
  /** Since the job started, and since its last event, when this was sent. */
  elapsedMs: number;
  idleMs: number;
  /** The job ended: screens stop showing it. */
  ended?: true;
}

/** What the preload script exposes as `window.codeLearn`. */
export interface Bridge {
  invoke(method: string, args: unknown[]): Promise<unknown>;
  /** Events main sends, to the app window only: check progress, job progress, and Run's output (to the window that started it). */
  onCheckProgress(listener: (progress: CheckProgress) => void): () => void;
  onJobProgress(listener: (progress: JobProgress) => void): () => void;
  onRunOutput(listener: (output: RunOutput) => void): () => void;
}
