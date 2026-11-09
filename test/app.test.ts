import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../src/app.js";
import { readFileMap } from "../src/files.js";
import type { LearnerEvent } from "../src/learner.js";
import * as store from "../src/store.js";
import { fixtureTrackFiles, installFixtureTrack, installTrack } from "./installed-track.js";
import { quizFiles } from "./quiz-fixture.js";
import { sandboxReady } from "./sandbox-ready.js";
import { tempDir } from "./temp.js";

/** Use cases that need no installing: tracks and exercises are written straight into the store. */

let ws: string;
beforeEach(() => {
  vi.stubEnv("CODE_LEARN_HOME", tempDir("code-learn-home-"));
  ws = tempDir("code-learn-ws-");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** The shell-io fixture track installed under another id and version, offering `styles` (a record-only change). */
function installFake(ref = "shell-io@1", styles: ("io" | "unit")[] = ["io"]): void {
  const { id, version } = store.parseTrackRef(ref);
  const files = fixtureTrackFiles("shell-io");
  files["track.yaml"] = files["track.yaml"]!.replace(/^id: .*$/m, `id: ${id}`).replace(/^version: .*$/m, `version: ${version}`);
  installTrack(files, (record) => ({ ...record, styles }));
}

function addExercise(course: string, slug: string, concept: string, track = "shell-io@1", readme = "Print the max."): void {
  store.commitFolder(
    store.exerciseDir(course, slug),
    { "README.md": readme, "starter/main.sh": "echo todo\n", "solution/main.sh": "SECRET-SOLUTION\n", "tests/visible/01.in": "3 1 2\n", "tests/hidden/01.in": "HIDDEN-INPUT\n" },
    {
      "exercise.json": {
        format_version: 1, slug, style: "io", concepts: [concept], difficulty: 1, track, createdAt: new Date().toISOString(),
        expected: { "visible/01": "3\n", "hidden/01": "HIDDEN-OUTPUT\n" },
      },
    },
  );
}

const event = (e: Record<string, unknown>) => ({ format_version: 1, at: new Date().toISOString(), ...e }) as LearnerEvent;

const roadmap = (concepts = "  - { id: sh.basics, title: Basics, requires: [] }\n  - { id: sh.loops, title: Loops, requires: [sh.basics] }\n", track = "shell-io@1") =>
  `goal: Shell basics\ntrack: ${track}\nstyle: io\nconcepts:\n${concepts}`;

describe("roadmap draft", () => {
  it("saves a roadmap before its track is installed and asks for setup", async () => {
    expect(await app.saveRoadmap(ws, "shell", roadmap())).toEqual({ course: "shell", concepts: 2 });
    expect(app.nextStep(ws)).toEqual({ kind: "setup", track: "shell-io@1" });
    installFake();
    expect(app.nextStep(ws)).toMatchObject({ kind: "author", concept: "sh.basics", title: "Basics", difficulty: 1, lesson: null, style: "io", track: "shell-io@1" });
  });

  it("refuses a style the installed track doesn't offer, at save and at next_step", async () => {
    installFake("shell-io@1", ["unit"]);
    await expect(app.saveRoadmap(ws, "shell", roadmap())).rejects.toThrow(/style/);
    await app.saveRoadmap(ws, "shell", roadmap(undefined, "shell-io@2"));
    installFake("shell-io@2", ["unit"]);
    expect(() => app.nextStep(ws)).toThrow(/Edit the roadmap's style/);
  });

  it("keeps the roadmap's title and returns it", async () => {
    await app.saveRoadmap(ws, "shell", `title: Shell scripting\n${roadmap()}`);
    expect(app.getRoadmap(ws).title).toBe("Shell scripting");
  });

  it("keeps the roadmap's sources and returns them", async () => {
    await app.saveRoadmap(ws, "shell", `${roadmap()}sources:\n  - { title: POSIX shell, url: "https://pubs.opengroup.org/onlinepubs/9799919799/" }\n`);
    expect(app.getRoadmap(ws).sources).toEqual([{ title: "POSIX shell", url: "https://pubs.opengroup.org/onlinepubs/9799919799/" }]);
  });

  it("returns practice, pitfalls and refs after saving and re-saving a roadmap", async () => {
    const yaml = roadmap('  - { id: sh.basics, title: Basics, practice: "Fix a loop", pitfalls: ["No budget"], refs: [0] }\n')
      + 'sources: [{ title: Guide, url: "https://example.com/guide" }]\n';
    await app.saveRoadmap(ws, "shell", yaml);
    await app.saveRoadmap(ws, "shell", yaml.replace("title: Basics", "title: First steps"));
    expect(app.getRoadmap(ws).concepts).toEqual([{ id: "sh.basics", title: "First steps", requires: [], practice: "Fix a loop", pitfalls: ["No budget"], refs: [0] }]);
  });

  it("returns the roadmap as saved", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    expect(app.getRoadmap(ws)).toEqual({
      course: "shell", goal: "Shell basics", track: "shell-io@1", style: "io",
      concepts: [{ id: "sh.basics", title: "Basics", requires: [] }, { id: "sh.loops", title: "Loops", requires: ["sh.basics"] }],
    });
  });

  it("takes renames, moves, additions and removals that keep ids and prerequisites", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    const edited = "  - { id: sh.basics, title: First steps, requires: [] }\n  - { id: sh.vars, title: Variables, requires: [] }\n";
    await app.saveRoadmap(ws, "shell", roadmap(edited));
    expect(app.getRoadmap(ws).concepts).toEqual([
      { id: "sh.basics", title: "First steps", requires: [] },
      { id: "sh.vars", title: "Variables", requires: [] },
    ]);
  });

  it("refuses to remove a concept another one requires", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    await expect(app.saveRoadmap(ws, "shell", roadmap("  - { id: sh.loops, title: Loops, requires: [sh.basics] }\n"))).rejects.toThrow(/unknown concept "sh.basics"/);
  });

  it.each([
    ["an event", () => store.appendEvent("shell", event({ kind: "skip", concept: "sh.loops" }))],
    ["an exercise", () => addExercise("shell", "e1", "sh.loops")],
  ])("refuses to remove a concept used by %s", async (_label, use) => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    use();
    await expect(app.saveRoadmap(ws, "shell", roadmap("  - { id: sh.basics, title: Basics, requires: [] }\n"))).rejects.toThrow(/sh\.loops/);
  });

  it("can change track until the course has an exercise", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    await app.saveRoadmap(ws, "shell", roadmap(undefined, "bash@1"));
    expect(app.getRoadmap(ws).track).toBe("bash@1");
    installFake("bash@1");
    addExercise("shell", "e1", "sh.basics", "bash@1");
    await expect(app.saveRoadmap(ws, "shell", roadmap())).rejects.toThrow(/has exercises/);
  });

  it("gives a stuck concept a fresh start when it gains a prerequisite", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    for (let i = 0; i < 2; i++) store.appendEvent("shell", event({ kind: "check", exercise: "e1", concepts: ["sh.loops"], difficulty: 1, passed: 0, total: 1, assisted: false }));
    const withPrereq = "  - { id: sh.basics, title: Basics, requires: [] }\n  - { id: sh.vars, title: Variables, requires: [] }\n  - { id: sh.loops, title: Loops, requires: [sh.basics, sh.vars] }\n";
    await app.saveRoadmap(ws, "shell", roadmap(withPrereq));
    expect(store.readEvents("shell").at(-1)).toMatchObject({ kind: "retry", concept: "sh.loops" });
    // Saving again adds no prerequisite, so there is no second retry.
    await app.saveRoadmap(ws, "shell", roadmap(withPrereq));
    expect(store.readEvents("shell").filter((e) => e.kind === "retry")).toHaveLength(1);
  });

  // A read-only file stands in for a full disk only on POSIX and for a non-root user.
  it.runIf(process.getuid?.() !== 0)("still gives the fresh start when the same roadmap is saved again after the retry couldn't be recorded", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    for (let i = 0; i < 2; i++) store.appendEvent("shell", event({ kind: "check", exercise: "e1", concepts: ["sh.loops"], difficulty: 1, passed: 0, total: 1, assisted: false }));
    const withPrereq = "  - { id: sh.basics, title: Basics, requires: [] }\n  - { id: sh.vars, title: Variables, requires: [] }\n  - { id: sh.loops, title: Loops, requires: [sh.basics, sh.vars] }\n";
    const events = join(process.env.CODE_LEARN_HOME!, "courses", "shell", "events.jsonl");
    chmodSync(events, 0o444);
    try {
      await expect(app.saveRoadmap(ws, "shell", roadmap(withPrereq))).rejects.toThrow();
    } finally {
      chmodSync(events, 0o644);
    }
    await app.saveRoadmap(ws, "shell", roadmap(withPrereq));
    expect(store.readEvents("shell").filter((e) => e.kind === "retry")).toEqual([expect.objectContaining({ concept: "sh.loops" })]);
    expect(app.progress(ws).concepts.find((c) => c.id === "sh.loops")).toMatchObject({ stuck: false });
  });
});

describe("the author step", () => {
  it.each([{ practice: "Fix a loop" }, { pitfalls: ["No budget"] }, { practice: "Fix a loop", pitfalls: [] }])
    ("passes the concept's practice and pitfalls to the author (%j)", async (fields) => {
      installFake();
      await app.saveRoadmap(ws, "shell", JSON.stringify({ goal: "G", track: "shell-io@1", style: "io", concepts: [{ id: "a", title: "A", ...fields }] }));
      expect(app.nextStep(ws)).toMatchObject({ kind: "author", title: "A", ...fields });
    });

  it("gives a fresh author the exact target and the installed track's learner-safe contract", async () => {
    const files = fixtureTrackFiles("custom-unit");
    installFixtureTrack("custom-unit");
    await app.saveRoadmap(ws, "calc", "goal: Calculator\ntrack: custom-unit@1\nstyle: unit\nconcepts:\n  - { id: calc.add, title: Adding numbers, requires: [] }\n");
    expect(app.nextStep(ws)).toEqual({
      kind: "author", concept: "calc.add", title: "Adding numbers", difficulty: 1, lesson: null, style: "unit", track: "custom-unit@1",
      contract: {
        files: ["src/calc.funcs"],
        test: "sh /opt/track/run-checks",
        limits: { time_ms: 5000, memory_mb: 128 },
        examples: {
          solution: { "src/calc.funcs": files["probe/unit/pass/src/calc.funcs"] },
          tests: { "negatives.check": files["probe/unit/tests/negatives.check"], "sums.check": files["probe/unit/tests/sums.check"] },
        },
      },
      earlier: [],
    });
  });
});

describe("authoring a new exercise", () => {
  it("lists the course's earlier exercises by title and first line, so the next one can differ", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    addExercise("shell", "sum-two", "sh.basics", "shell-io@1", "# Sum two numbers\n\nRead two integers on one line and print their sum.\n\n## Example\n\n`3 5` prints `8`.\n");
    for (let i = 0; i < 4; i++) {
      store.appendEvent("shell", event({ kind: "check", at: new Date().toISOString(), exercise: "sum-two", concepts: ["sh.basics"], difficulty: 1, passed: 1, total: 1, assisted: false }));
    }
    const step = app.nextStep(ws);
    expect(step).toMatchObject({ kind: "author", earlier: [{ title: "Sum two numbers", summary: "Read two integers on one line and print their sum." }] });
    // The statement only: never the solution or hidden tests.
    expect(JSON.stringify(step)).not.toMatch(/SECRET|HIDDEN/);
  });
});

describe("an author step's learner context", () => {
  it("carries the concept's lesson text and the learner's last result on it: its exercise and counts", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    await app.saveLesson(ws, { id: "basics-intro", concept: "sh.basics", title: "Reading input", markdown: "# Reading input\n\nUse `read a b` to read two words.\n" });
    addExercise("shell", "sum-two", "sh.basics", "shell-io@1", "# Sum two numbers\n\nRead two integers and print their sum.\n");
    store.appendEvent("shell", event({ kind: "check", at: new Date().toISOString(), exercise: "sum-two", concepts: ["sh.basics"], difficulty: 1, passed: 3, total: 3, assisted: false }));
    const step = app.nextStep(ws);
    expect(step).toMatchObject({ kind: "author", difficulty: 2, lessonText: expect.stringContaining("Use `read a b` to read two words."), last: { exercise: "sum-two", passed: 3, total: 3, assisted: false } });
    // The exercise the learner sees and counts: never a test's message or output (a perfect check misses nothing).
    expect(Object.keys((step as { last: object }).last).sort()).toEqual(["assisted", "exercise", "passed", "total"]);
  });

  it("puts the newest lesson first and keeps the text within 32 KB, never the learner's notes", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    await app.saveLesson(ws, { id: "basics-long", concept: "sh.basics", title: "Long", markdown: `# Long\n\n${"é".repeat(30_000)}\n` });
    await app.saveLesson(ws, { id: "basics-again", concept: "sh.basics", title: "Again", markdown: "# Again\n\nThe re-teach.\n" });
    await app.saveNotes(ws, "basics-again", "MY PRIVATE NOTE");
    const step = app.nextStep(ws) as { lessonText: string };
    expect(step.lessonText.startsWith("# Again")).toBe(true);
    expect(Buffer.byteLength(step.lessonText)).toBeLessThanOrEqual(32_768);
    expect(step.lessonText).not.toContain("MY PRIVATE NOTE");
  });

  it("leaves both out when the concept has no lesson and no check yet", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    expect(app.nextStep(ws)).not.toHaveProperty("lessonText");
    expect(app.nextStep(ws)).not.toHaveProperty("last");
  });
});

describe("reviews", () => {
  it("shows when a mastered concept's review is due, and asks for it once due", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    for (let i = 0; i < 4; i++) {
      store.appendEvent("shell", event({ kind: "check", at: twoDaysAgo, exercise: `e${i}`, concepts: ["sh.basics"], difficulty: 1, passed: 1, total: 1, assisted: false }));
    }
    const due = new Date(Date.parse(twoDaysAgo) + 86_400_000).toISOString();
    expect(app.progress(ws).concepts[0]).toMatchObject({ id: "sh.basics", mastered: true, reviewDue: due });
    expect(app.nextStep(ws)).toMatchObject({ kind: "author", concept: "sh.basics", difficulty: 3, review: true, title: "Basics" });
  });
});

describe("error kinds", () => {
  it("names a missing course, so the desktop needn't read the English", () => {
    expect(() => app.nextStep(ws)).toThrow(expect.objectContaining({ kind: "no-course", message: expect.stringMatching(/No course in this workspace yet/) }));
  });

  it("names a track whose toolchain folder is missing, so the desktop can offer a rebuild", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    addExercise("shell", "e1", "sh.basics");
    rmSync(store.envDir("shell-io@1"), { recursive: true });
    await expect(app.testExercise(ws, "e1")).rejects.toMatchObject({ kind: "toolchain-missing", message: expect.stringMatching(/toolchain for shell-io@1 is missing/) });
  });
});

describe("assistance", () => {
  it("records assistance on the exercise that ends up current, even when opening one races turning it on", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    addExercise("shell", "e1", "sh.basics");
    addExercise("shell", "e2", "sh.basics");
    await app.getExercise(ws, "e1");
    // Hold the course lock, so turning assistance on has to wait for it while e2 is opened.
    let release!: () => void;
    const held = store.withLock(store.courseLockPath("shell"), () => new Promise<void>((r) => (release = r)));
    const assisting = app.setAssist(ws, true);
    await new Promise((r) => setTimeout(r, 50));
    const opening = app.getExercise(ws, "e2");
    await new Promise((r) => setTimeout(r, 50));
    release();
    await Promise.all([held, assisting, opening]);
    expect(store.readWorkspace(ws)).toMatchObject({ current: "e2", assist: true });
    expect(store.readEvents("shell").filter((e) => e.kind === "assist").map((e) => (e as { exercise: string }).exercise)).toContain("e2");
  });
});

describe("a solution the learner may see", () => {
  const failed = () => store.appendEvent("shell", event({ kind: "check", exercise: "e1", concepts: ["sh.basics"], difficulty: 1, passed: 0, total: 1, assisted: false }));
  const passed = () => store.appendEvent("shell", event({ kind: "check", exercise: "e1", concepts: ["sh.basics"], difficulty: 1, passed: 1, total: 1, assisted: false }));

  async function course() {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    addExercise("shell", "e1", "sh.basics");
  }

  it("stays closed until three recorded checks have failed", async () => {
    await course();
    await expect(app.getSolution(ws, "e1")).rejects.toThrow(/3 recorded checks/);
    failed();
    failed();
    await expect(app.getSolution(ws, "e1")).rejects.toThrow(/has 2/);
    failed();
    expect(await app.getSolution(ws, "e1")).toEqual({ exercise: "e1", files: { "main.sh": "SECRET-SOLUTION\n" } });
  });

  it("opens after one passing check, however few failed", async () => {
    await course();
    passed();
    expect(await app.getSolution(ws, "e1")).toMatchObject({ exercise: "e1" });
  });

  it("returns only the track's learner files, never tests, mutants or expected outputs", async () => {
    await course();
    passed();
    const { files } = await app.getSolution(ws, "e1");
    expect(Object.keys(files)).toEqual(["main.sh"]);
    expect(JSON.stringify(files)).not.toMatch(/HIDDEN/);
  });

  it("records an assist when it opens, so a later check counts as assisted", async () => {
    await course();
    passed();
    await app.getSolution(ws, "e1");
    expect(store.readEvents("shell").filter((e) => e.kind === "assist")).toEqual([expect.objectContaining({ exercise: "e1" })]);
    await app.getSolution(ws, "e1");
    expect(store.readEvents("shell").filter((e) => e.kind === "assist")).toHaveLength(1);
  });

  it("is never open for a quiz", async () => {
    await course();
    store.commitFolder(store.exerciseDir("shell", "q1"), { "README.md": "# Quiz\n", "quiz.yaml": "questions: []\n" }, { "exercise.json": { format_version: 1, slug: "q1", style: "quiz", concepts: ["sh.basics"], difficulty: 1, createdAt: new Date().toISOString() } });
    await expect(app.getSolution(ws, "q1")).rejects.toThrow(/quiz has no solution/);
  });

  it("reports the recorded checks and whether one passed, for the exercise status", async () => {
    await course();
    expect(app.exerciseStatus(ws, "e1")).toEqual({ checks: 0, solutionChecks: 3, solutionOpen: false });
    failed();
    failed();
    expect(app.exerciseStatus(ws, "e1")).toEqual({ checks: 2, solutionChecks: 3, solutionOpen: false, last: { passed: 0, total: 1, at: expect.any(String) } });
    passed();
    expect(app.exerciseStatus(ws, "e1")).toMatchObject({ checks: 3, solved: { passed: 1, total: 1 }, solutionOpen: true, last: { passed: 1, total: 1 } });
  });
});

describe("lessons", () => {
  const lesson = (id: string, concept = "sh.basics") => ({ id, concept, title: `About ${id}`, markdown: `# ${id}\n\nText.` });

  beforeEach(async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
  });

  it("saves a lesson before the track is installed, and reads it with notes", async () => {
    expect(await app.saveLesson(ws, lesson("intro"))).toEqual({ lesson: "intro" });
    expect(app.getLesson(ws, "intro")).toEqual({ id: "intro", concept: "sh.basics", title: "About intro", markdown: "# intro\n\nText.", notes: "", examples: [] });
    await app.saveNotes(ws, "intro", "remember $1");
    expect(app.getLesson(ws, "intro").notes).toBe("remember $1");
    const record = JSON.parse(readFileSync(join(process.env.CODE_LEARN_HOME!, "courses", "shell", "lessons", "intro", "lesson.json"), "utf8"));
    expect(record).toMatchObject({ format_version: 1, id: "intro", concept: "sh.basics" });
  });

  it.each([
    ["a taken id", () => lesson("intro"), /already used/],
    ["a concept outside the roadmap", () => lesson("x", "sh.nope"), /not in the roadmap/],
    ["more than 64 KB", () => ({ ...lesson("big"), markdown: "x".repeat(65_537) }), /64 KB/],
    ["an unsafe id", () => lesson("../up"), /id/],
  ])("refuses %s", async (_label, input, error) => {
    await app.saveLesson(ws, lesson("intro"));
    await expect(app.saveLesson(ws, input())).rejects.toThrow(error);
  });

  it("refuses examples before the track is set up, and examples that don't follow its contract, without running anything", async () => {
    const withExample = (files: Record<string, string>) => ({ ...lesson("ex"), markdown: "Try it:\n\n```example\n1\n```\n", examples: [files] });
    await expect(app.saveLesson(ws, withExample({ "main.sh": "echo 1\n" }))).rejects.toThrow(/isn't set up yet/);
    installFake();
    await expect(app.saveLesson(ws, withExample({ "other.sh": "echo 1\n" }))).rejects.toThrow(/Example 1 must hold exactly the track's learner files \(main\.sh\)/);
    await expect(app.saveLesson(ws, withExample({ "main.sh": "echo 1\n", "tests/a.sh": "x" }))).rejects.toThrow(/exactly the track's learner files/);
    expect(app.listLessons(ws)).toEqual([]);
  });

  it("refuses notes over 64 KB and notes on a missing lesson", async () => {
    await app.saveLesson(ws, lesson("intro"));
    await expect(app.saveNotes(ws, "intro", "x".repeat(65_537))).rejects.toThrow(/64 KB/);
    await expect(app.saveNotes(ws, "nope", "x")).rejects.toThrow(/No lesson/);
  });

  it("records a read only on acknowledgement, and only once", async () => {
    await app.saveLesson(ws, lesson("intro"));
    app.getLesson(ws, "intro");
    expect(store.readEvents("shell")).toEqual([]);
    await app.markLessonRead(ws, "intro");
    await app.markLessonRead(ws, "intro");
    expect(store.readEvents("shell")).toEqual([expect.objectContaining({ kind: "read", lesson: "intro", concept: "sh.basics" })]);
    expect(app.listLessons(ws)).toEqual([{ id: "intro", concept: "sh.basics", title: "About intro", created: expect.any(String), read: true }]);
  });

  it("keeps a code concept stuck after reading its lesson", async () => {
    installFake();
    addExercise("shell", "first", "sh.basics");
    for (let i = 0; i < 2; i++) store.appendEvent("shell", event({ kind: "check", exercise: "first", concepts: ["sh.basics"], difficulty: 1, passed: 0, total: 1, assisted: false }));
    expect(app.nextStep(ws)).toEqual({ kind: "stuck", concept: "sh.basics" });
    await app.saveLesson(ws, lesson("intro"));
    await app.markLessonRead(ws, "intro");
    expect(app.nextStep(ws)).toEqual({ kind: "stuck", concept: "sh.basics" });
    expect(store.readEvents("shell").filter((e) => e.kind === "retry")).toEqual([]);
    store.appendEvent("shell", event({ kind: "check", exercise: "first", concepts: ["sh.basics"], difficulty: 1, passed: 1, total: 1, assisted: false }));
    expect(app.nextStep(ws).kind).not.toBe("stuck");
  });

  it("asks for a lesson, then the earliest unread one, before practice", async () => {
    installFake();
    expect(app.nextStep(ws)).toMatchObject({ kind: "author", lesson: null });
    await app.saveLesson(ws, lesson("intro"));
    await app.saveLesson(ws, lesson("more"));
    expect(app.nextStep(ws)).toMatchObject({ kind: "author", lesson: "intro" });
    await app.markLessonRead(ws, "intro");
    await app.markLessonRead(ws, "more");
    expect(app.nextStep(ws)).not.toHaveProperty("lesson");
  });

  it("keeps a concept a lesson uses in the roadmap", async () => {
    await app.saveLesson(ws, lesson("loops", "sh.loops"));
    await expect(app.saveRoadmap(ws, "shell", roadmap("  - { id: sh.basics, title: Basics, requires: [] }\n"))).rejects.toThrow(/sh\.loops/);
  });
});

describe("hidden material", () => {
  it("gives the reply filter an exercise's hidden texts only: solution, mutants, hidden tests and hidden expected outputs", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    store.commitFolder(store.exerciseDir("shell", "e1"), {
      "README.md": "VISIBLE statement", "starter/main.sh": "VISIBLE starter", "tests/visible/01.in": "VISIBLE input",
      "solution/main.sh": "HIDDEN solution", "mutants/m/main.sh": "HIDDEN mutant", "tests/hidden/01.in": "HIDDEN input",
    }, {
      "exercise.json": {
        format_version: 1, slug: "e1", style: "io", concepts: ["sh.basics"], difficulty: 1, track: "shell-io@1", createdAt: new Date().toISOString(),
        expected: { "visible/01": "VISIBLE expected", "hidden/01": "HIDDEN expected" },
      },
    });
    const material = app.hiddenMaterial("shell", "e1");
    expect([...material].sort()).toEqual(["HIDDEN expected", "HIDDEN input", "HIDDEN mutant", "HIDDEN solution"]);
  });
});

describe("exercise list", () => {
  it("lists exercises with what a job's done check needs, and nothing hidden", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    addExercise("shell", "e1", "sh.basics");
    const list = app.listExercises(ws);
    expect(list).toEqual([{ exercise: "e1", concepts: ["sh.basics"], difficulty: 1, created: expect.any(String) }]);
    expect(JSON.stringify(list)).not.toMatch(/SECRET|HIDDEN/);
  });
});

describe("learner files", () => {
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const file = () => join(ws, "exercises", "shell", "e1", "main.sh");

  beforeEach(async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    addExercise("shell", "e1", "sh.basics");
  });

  it("reads only the exercise's track files, with digests", () => {
    const files = app.readLearnerFiles(ws, "e1");
    expect(files).toEqual({ "main.sh": { text: "echo todo\n", digest: sha("echo todo\n") } });
    expect(JSON.stringify(files)).not.toMatch(/SECRET|HIDDEN/);
  });

  it("saves a file loaded with the current digest, and refuses a stale one", async () => {
    const { digest } = app.readLearnerFiles(ws, "e1")["main.sh"]!;
    expect(await app.writeLearnerFile(ws, "e1", "main.sh", "echo 3\n", digest)).toEqual({ digest: sha("echo 3\n") });
    expect(readFileSync(file(), "utf8")).toBe("echo 3\n");
    await expect(app.writeLearnerFile(ws, "e1", "main.sh", "echo 4\n", digest)).rejects.toMatchObject({ kind: "changed", message: expect.stringMatching(/Changed outside code-learn/) });
    expect(readFileSync(file(), "utf8")).toBe("echo 3\n");
  });

  it("refuses files that aren't the exercise's track files", async () => {
    app.readLearnerFiles(ws, "e1");
    await expect(app.writeLearnerFile(ws, "e1", "README.md", "x", sha("Print the max."))).rejects.toThrow(/isn't one of/);
    await expect(app.writeLearnerFile(ws, "e1", "../e2/main.sh", "x", sha("x"))).rejects.toThrow(/isn't one of/);
  });

  it.runIf(process.platform !== "win32")("refuses to write through a symlink", async () => {
    app.readLearnerFiles(ws, "e1");
    const outside = join(tempDir("code-learn-outside-"), "target.sh");
    writeFileSync(outside, "echo todo\n");
    rmSync(file());
    symlinkSync(outside, file());
    await expect(app.writeLearnerFile(ws, "e1", "main.sh", "echo 3\n", sha("echo todo\n"))).rejects.toThrow(/symlink/);
    expect(readFileSync(outside, "utf8")).toBe("echo todo\n");
  });
});

describe("setup proposals", () => {
  const track = () => readFileMap(join(import.meta.dirname, "fixtures", "tracks", "shell-io"));
  const proposed = { proposed: "shell-io@1", note: "The learner decides in code-learn. End your turn." };

  // With no micromamba, anything that tried to install would fail with no-micromamba.
  beforeEach(() => vi.stubEnv("CODE_LEARN_MICROMAMBA", join(tempDir("code-learn-nowhere-"), "micromamba")));

  it("stores a proposal and installs nothing; approving a roadmap installs nothing either", async () => {
    expect(await app.proposeTrack(track())).toEqual(proposed);
    await app.saveRoadmap(ws, "shell", roadmap());
    expect(app.listTracks()).toEqual([]);
    const [p] = app.listProposals();
    expect(p).toMatchObject({ track: "shell-io@1", digest: expect.stringMatching(/^[0-9a-f]{64}$/), files: track() });
  });

  it("replaces an older proposal for the same track", async () => {
    await app.proposeTrack(track());
    const first = app.listProposals()[0]!.digest;
    await app.proposeTrack({ ...track(), "notes.md": "# again\n" });
    expect(app.listProposals().map((p) => p.digest)).not.toContain(first);
    expect(app.listProposals()).toHaveLength(1);
    await expect(app.installProposal("shell-io@1", first)).rejects.toThrow(/changed or is gone/);
  });

  it("refuses to install files that changed after the learner saw them", async () => {
    await app.proposeTrack(track());
    const { digest } = app.listProposals()[0]!;
    writeFileSync(join(process.env.CODE_LEARN_HOME!, "proposals", "shell-io@1", digest, "files", "main.sh"), "echo evil\n");
    await expect(app.installProposal("shell-io@1", digest)).rejects.toThrow(/changed or is gone/);
    await expect(app.installProposal("shell-io@1", "0".repeat(64))).rejects.toThrow(/changed or is gone/);
  });

  it("reports an identical installed track, and refuses a different one under the same version", async () => {
    installFixtureTrack("shell-io");
    expect(await app.proposeTrack(track())).toEqual({ installed: "shell-io@1", unchanged: true });
    await expect(app.proposeTrack({ ...track(), "main.sh": "echo other\n" })).rejects.toThrow(/already installed/);
    expect(app.listProposals()).toEqual([]);
  });

  it("keeps a track file named like code-learn's own record intact", async () => {
    await app.proposeTrack({ ...track(), "proposal.json": "{}" });
    const [p] = app.listProposals();
    expect(p!.files["proposal.json"]).toBe("{}");
    // Installing would stage a toolchain, which needs micromamba: refused before anything is built.
    await expect(app.installProposal("shell-io@1", p!.digest)).rejects.toMatchObject({ code: "no-micromamba" });
  });

  it.each([
    ["a Dockerfile", (t: Record<string, string>) => { t.Dockerfile = "FROM alpine\n"; }, /Gate "valid".*Dockerfile/],
    ["no toolchain block", (t: Record<string, string>) => { t["track.yaml"] = t["track.yaml"]!.replace(/^toolchain:.*$/m, ""); }, /toolchain/],
    ["a probe without its fail solution", (t: Record<string, string>) => { delete t["probe/io/fail/main.sh"]; }, /Gate "valid"/],
  ])("refuses to propose a track with %s", async (_label, change, message) => {
    const t = track();
    change(t);
    await expect(app.proposeTrack(t)).rejects.toThrow(message);
    expect(app.listProposals()).toEqual([]);
  });

  it("refuses to install a proposal for a course whose style changed after it was proposed", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    await app.proposeTrack(track());
    const { digest } = app.listProposals()[0]!;
    await app.saveRoadmap(ws, "shell", roadmap().replace("style: io", "style: unit"));
    await expect(app.installProposal("shell-io@1", digest)).rejects.toThrow(/Course "shell" needs style "unit", but shell-io@1 offers io/);
    await expect(app.saveTrack(track())).rejects.toThrow(/needs style "unit"/);
  });

  it("makes a roadmap save wait for an install of its track to finish", async () => {
    let saved = false;
    let save: Promise<unknown> | undefined;
    await store.withLock(store.trackLockPath("shell-io"), async () => {
      save = app.saveRoadmap(ws, "shell", roadmap()).then(() => (saved = true));
      await new Promise((r) => setTimeout(r, 300));
      expect(saved).toBe(false);
    });
    await save;
    expect(saved).toBe(true);
  });

  it("drops a track's proposals", async () => {
    await app.proposeTrack(track());
    await app.dropProposal("shell-io@1");
    expect(app.listProposals()).toEqual([]);
  });
});

describe("lessons only", () => {
  const lessonsOnly = () => roadmap().replace("track: shell-io@1\n", "").replace("style: io", "style: none");
  it("needs no track, progresses through reads, and exposes coverage", async () => {
    await app.saveRoadmap(ws, "shell", lessonsOnly());
    expect(app.nextStep(ws)).toEqual({ kind: "learn", concept: "sh.basics", lesson: null });
    expect(app.progress(ws).concepts[0]).toMatchObject({ covered: false });
    await app.saveLesson(ws, { id: "intro", concept: "sh.basics", title: "Intro", markdown: "Read this." });
    expect(app.nextStep(ws)).toEqual({ kind: "learn", concept: "sh.basics", lesson: "intro" });
    await app.markLessonRead(ws, "intro");
    expect(app.progress(ws).concepts[0]).toMatchObject({ covered: true, mastery: 0.5 });
    expect(app.progress(ws).next).toEqual({ kind: "learn", concept: "sh.loops", lesson: null });
    await app.saveLesson(ws, { id: "more", concept: "sh.basics", title: "More", markdown: "Read more." });
    expect(app.progress(ws).concepts[0]).toMatchObject({ covered: false });
  });
  it.each(["getExercise", "checkExercise", "testExercise", "saveExercise"] as const)("refuses %s before looking up a track or exercise", async (operation) => {
    await app.saveRoadmap(ws, "shell", lessonsOnly());
    const call = operation === "saveExercise" ? app.saveExercise(ws, {}) : app[operation](ws);
    await expect(call).rejects.toThrow(/lessons only.*Turn activities on/);
  });
  it("keeps the track, exercises, events, mastery and reads when switched both ways", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", roadmap());
    addExercise("shell", "e", "sh.basics");
    store.appendEvent("shell", event({ kind: "check", exercise: "e", concepts: ["sh.basics"], difficulty: 1, passed: 1, total: 1, assisted: false }));
    await app.saveLesson(ws, { id: "intro", concept: "sh.basics", title: "Intro", markdown: "Read this." });
    await app.markLessonRead(ws, "intro");
    const log = store.readEvents("shell");
    const mastery = app.progress(ws).concepts[0]!.mastery;
    await app.saveRoadmap(ws, "shell", roadmap().replace("style: io", "style: none"));
    expect(app.getRoadmap(ws).track).toBe("shell-io@1");
    expect(app.nextStep(ws).kind).toBe("learn");
    await expect(app.saveRoadmap(ws, "shell", lessonsOnly())).rejects.toThrow(/can't switch tracks/);
    await app.saveRoadmap(ws, "shell", roadmap());
    expect(store.readEvents("shell")).toEqual(log);
    expect(app.progress(ws).concepts[0]).toMatchObject({ mastery, covered: true });
    expect(app.listLessons(ws)[0]!.read).toBe(true);
    expect(app.nextStep(ws)).not.toHaveProperty("lesson");
  });
});

describe("mixed course", () => {
  const mixed = () => roadmap().replace("style: io", "style: both");
  /** A quiz on sh.basics, for the mixed course (quizFiles names concept "a"). */
  const quizOn = (slug: string) => ({ ...quizFiles(slug), "exercise.yaml": JSON.stringify({ slug, style: "quiz", concepts: ["sh.basics"], difficulty: 1 }) });

  it("is written as format 2, authors in the track's code style, and accepts a track proposal", async () => {
    await app.saveRoadmap(ws, "shell", mixed());
    expect(store.readCourse("shell")).toMatchObject({ format_version: 2, style: "both", track: "shell-io@1" });
    expect(await app.proposeTrack(readFileMap(join(import.meta.dirname, "fixtures", "tracks", "shell-io")))).toMatchObject({ proposed: "shell-io@1" });
    installFake();
    expect(app.nextStep(ws)).toMatchObject({ kind: "author", style: "both", track: "shell-io@1", concept: "sh.basics", contract: { run: "sh main.sh" } });
  });

  it("saves a quiz exercise into the mixed course, and checks it as a quiz", async () => {
    await app.saveRoadmap(ws, "shell", mixed());
    await app.saveExercise(ws, quizOn("first"));
    expect(store.listExercises("shell")).toMatchObject([{ slug: "first", style: "quiz" }]);
    expect(await app.getExercise(ws, "first")).toMatchObject({ style: "quiz", questions: expect.any(Array) });
    const answers = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, 1]));
    const file = app.readLearnerFiles(ws, "first")["answers.yaml"]!;
    await app.writeLearnerFile(ws, "first", "answers.yaml", JSON.stringify(answers), file.digest);
    expect(await app.checkExercise(ws, "first")).toMatchObject({ total: 5, recorded: true });
  });

  it("retries a stuck concept once its lesson is read, as a quiz course does", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", mixed());
    for (const slug of ["first", "second"]) {
      await app.saveExercise(ws, quizOn(slug));
      await app.writeLearnerFile(ws, slug, "answers.yaml", JSON.stringify({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }), app.readLearnerFiles(ws, slug)["answers.yaml"]!.digest);
      await app.checkExercise(ws, slug);
    }
    expect(app.nextStep(ws)).toEqual({ kind: "stuck", concept: "sh.basics" });
    await app.saveLesson(ws, { id: "intro", concept: "sh.basics", title: "Intro", markdown: "Read this." });
    await app.markLessonRead(ws, "intro");
    expect(app.nextStep(ws)).toMatchObject({ kind: "author", concept: "sh.basics" });
  });

  it("saves a code exercise in the track's style", async () => {
    installFixtureTrack("shell-io");
    await app.saveRoadmap(ws, "shell", mixed());
    await app.saveExercise(ws, readFileMap(join(import.meta.dirname, "fixtures", "exercises", "io-max")));
    expect(store.listExercises("shell")).toMatchObject([{ slug: "max-of-line", style: "io", track: "shell-io@1" }]);
  });

  it("refuses to become a code course while it has quiz exercises", async () => {
    installFake();
    await app.saveRoadmap(ws, "shell", mixed());
    await app.saveExercise(ws, quizOn("first"));
    await expect(app.saveRoadmap(ws, "shell", roadmap())).rejects.toThrow(/quiz exercises/);
    expect(store.readCourse("shell")).toMatchObject({ style: "both" });
  });
});

it.runIf(sandboxReady())("keeps lesson examples on a retained track's coding style when activities are off", async () => {
  installFake();
  await app.saveRoadmap(ws, "shell", roadmap().replace("style: io", "style: none"));
  expect(app.getRoadmap(ws, undefined, true).contract).toMatchObject({ run: "sh main.sh" });
  // A valid io example runs in the sandbox, rather than being mistaken for a unit example needing tests/.
  await expect(app.saveLesson(ws, { id: "ex", concept: "sh.basics", title: "Example", markdown: "```example\n1\n```", examples: [{ "main.sh": "echo 1" }] })).resolves.toEqual({ lesson: "ex" });
  expect(app.listLessons(ws)).toHaveLength(1);
});

it("re-saves a course without making it active when asked, so another course's draft stays active", async () => {
  await app.saveRoadmap(ws, "shell", roadmap());
  await app.saveRoadmap(ws, "draft", roadmap());
  await app.saveRoadmap(ws, "shell", roadmap().replace("style: io", "style: none"), "shell", false);
  expect(app.getRoadmap(ws).course).toBe("draft");
  expect(app.getRoadmap(ws, "shell").style).toBe("none");
});

it("allows proposing a coding track retained by a lessons-only course", async () => {
  await app.saveRoadmap(ws, "shell", roadmap().replace("style: io", "style: none"));
  expect(await app.proposeTrack(readFileMap(join(import.meta.dirname, "fixtures", "tracks", "shell-io")))).toMatchObject({ proposed: "shell-io@1" });
});

describe("removing a track", () => {
  it("deletes the record and the toolchain folder, and lists the track no more", async () => {
    installFixtureTrack("shell-io");
    expect(existsSync(store.envDir("shell-io@1"))).toBe(true);
    expect(await app.removeTrack("shell-io@1")).toEqual({ removed: "shell-io@1" });
    expect(existsSync(store.envDir("shell-io@1"))).toBe(false);
    expect(store.readTrack("shell-io@1")).toBeUndefined();
    expect(app.listTracks()).toEqual([]);
  });

  it("refuses while a course uses the track, names the course, and keeps both folders", async () => {
    installFixtureTrack("shell-io");
    await app.saveRoadmap(ws, "shell", roadmap());
    await expect(app.removeTrack("shell-io@1")).rejects.toThrow(/used by course "shell"/);
    expect(existsSync(store.envDir("shell-io@1"))).toBe(true);
    expect(app.listTracks()).toHaveLength(1);
  });

  it("names a course by its title when it has one", async () => {
    installFixtureTrack("shell-io");
    await app.saveRoadmap(ws, "shell", `title: Shell scripting\n${roadmap()}`);
    await expect(app.removeTrack("shell-io@1")).rejects.toThrow(/used by course "Shell scripting"/);
  });

  it("refuses a track that isn't installed", async () => {
    await expect(app.removeTrack("shell-io@1")).rejects.toThrow(/shell-io@1/);
  });

  it("removes only the version asked for", async () => {
    installFake("shell-io@1");
    installFake("shell-io@2");
    await app.removeTrack("shell-io@1");
    expect(app.listTracks().map((t) => t.track)).toEqual(["shell-io@2"]);
    expect(existsSync(store.envDir("shell-io@2"))).toBe(true);
  });
});

describe("renaming and deleting a course", () => {
  it("renames the course, trimmed, and keeps the rest of its roadmap", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    expect(await app.renameCourse("shell", "  Shell basics  ")).toEqual({ course: "shell", title: "Shell basics" });
    expect(store.readCourse("shell")).toMatchObject({ title: "Shell basics", goal: "Shell basics", concepts: [{ id: "sh.basics" }, { id: "sh.loops" }] });
  });

  it("refuses an empty name and one longer than a roadmap's title, writing nothing", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    await expect(app.renameCourse("shell", "   ")).rejects.toThrow(/needs a name/);
    await expect(app.renameCourse("shell", "x".repeat(61))).rejects.toThrow(/at most 60 characters/);
    expect(store.readCourse("shell")?.title).toBeUndefined();
  });

  it("refuses an unknown course without creating a folder for it", async () => {
    await expect(app.renameCourse("nope", "Name")).rejects.toThrow(/No course "nope"/);
    await expect(app.deleteCourse(ws, "nope")).rejects.toThrow(/No course "nope"/);
    expect(existsSync(join(store.codeLearnHome(), "courses", "nope"))).toBe(false);
  });

  it("deletes the course folder, its log and exercise files, and clears the workspace's pointers to it", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    addExercise("shell", "loops-1", "sh.loops");
    store.appendEvent("shell", event({ kind: "skip", concept: "sh.basics" }));
    mkdirSync(join(ws, "exercises", "shell", "loops-1"), { recursive: true });
    writeFileSync(join(ws, "exercises", "shell", "loops-1", "main.sh"), "echo hi\n");
    expect(store.readWorkspace(ws).course).toBe("shell");

    expect(await app.deleteCourse(ws, "shell")).toEqual({ deleted: "shell" });
    expect(existsSync(join(store.codeLearnHome(), "courses", "shell"))).toBe(false);
    expect(existsSync(join(ws, "exercises", "shell"))).toBe(false);
    expect(store.readWorkspace(ws).course).toBeUndefined();
    expect(store.listCourses()).toEqual([]);
  });

  it("keeps the workspace's pointers when they name another course", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    await app.saveRoadmap(ws, "calc", "goal: Calculator\ntrack: custom-unit@1\nstyle: unit\nconcepts:\n  - { id: calc.add, title: Adding, requires: [] }\n");
    await app.deleteCourse(ws, "shell");
    expect(store.readWorkspace(ws).course).toBe("calc");
    expect(store.listCourses()).toEqual(["calc"]);
  });

  it("never brings back a deleted course's folder when a rename arrives after the delete", async () => {
    await app.saveRoadmap(ws, "shell", roadmap());
    await app.deleteCourse(ws, "shell");
    await expect(app.renameCourse("shell", "Late")).rejects.toThrow(/No course "shell"/);
    expect(existsSync(join(store.codeLearnHome(), "courses", "shell"))).toBe(false);
    expect(store.listCourses()).toEqual([]);
  });
});
