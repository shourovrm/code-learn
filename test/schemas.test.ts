import { LESSON_FRAME, lessonFields } from "./lesson-fixture.js";
import { describe, expect, it } from "vitest";
import { codeStyleOf, CourseRecord, exampleRefs, LearnerEventSchema, parseExerciseYaml, parseLesson, parseQuizYaml, parseRoadmapYaml, parseTrackYaml, TrackRecord } from "../src/schemas.js";
import { quizQuestions } from "./quiz-fixture.js";

describe("quiz text limits", () => {
  it.each([
    ["question", 1000, (q: ReturnType<typeof quizQuestions>, text: string) => { q[0]!.text = text; }],
    ["choice", 300, (q: ReturnType<typeof quizQuestions>, text: string) => { q[0]!.choices[0]!.text = text; }],
    ["why", 500, (q: ReturnType<typeof quizQuestions>, text: string) => { q[0]!.choices[1]!.why = text; }],
  ] as const)("caps %s text at %i without exposing the key", (_, limit, change) => {
    const questions = quizQuestions();
    change(questions, "PRIVATE".padEnd(limit, "x"));
    expect(() => parseQuizYaml(JSON.stringify({ questions }))).not.toThrow();
    change(questions, "PRIVATE".padEnd(limit + 1, "x"));
    expect(() => parseQuizYaml(JSON.stringify({ questions }))).toThrow("Invalid quiz.yaml: write 5 to 10 questions with text (at most 1000 characters), each with 3 to 5 choices with text (at most 300 characters), exactly one correct: true, and why (at most 500 characters) on every wrong choice.");
  });
});

describe("check events", () => {
  const check = { format_version: 1, kind: "check", at: "2026-10-31T00:00:00Z", exercise: "e", concepts: ["a"], difficulty: 1, passed: 0, total: 102, assisted: false };

  it("reads old events without missed and ignores unknown fields", () => {
    expect(LearnerEventSchema.parse(check)).toEqual(check);
    expect(LearnerEventSchema.parse({ ...check, future: true })).toEqual(check);
  });

  it("reads up to 50 visible names and 50 hidden indexes, and drops the rest instead of calling the log damaged", () => {
    const missed = { visible: Array.from({ length: 50 }, (_, i) => `visible/${i}`), hidden: Array.from({ length: 50 }, (_, i) => i + 1) };
    expect(LearnerEventSchema.parse({ ...check, missed })).toEqual({ ...check, missed });
    // A later code-learn may record more; this one still reads the log.
    expect(LearnerEventSchema.parse({ ...check, missed: { visible: [...missed.visible, "extra"], hidden: [...missed.hidden, 51] } })).toEqual({ ...check, missed });
  });

  it.each([0, -1, 1.5, "hidden/secret"])("rejects a hidden index of %j", (index) => {
    expect(LearnerEventSchema.safeParse({ ...check, missed: { visible: [], hidden: [index] } }).success).toBe(false);
  });
});

describe("parseTrackYaml", () => {
  it("accepts an io track and clamps limits to the host ceilings", () => {
    const t = parseTrackYaml(`id: c\nversion: 1\nstyles: [io]\nfiles: [main.c]\nrun: /tmp/main\nlimits: { time_ms: 999999, memory_mb: 99999 }\ntoolchain: { packages: [x] }\n`);
    expect(t.limits).toEqual({ time_ms: 120000, memory_mb: 2048 });
  });

  it("fills default limits", () => {
    expect(parseTrackYaml(`id: c\nversion: 1\nstyles: [io]\nfiles: [main.c]\nrun: x\ntoolchain: { packages: [x] }\n`).limits).toEqual({ time_ms: 2000, memory_mb: 256 });
  });

  it("reads an empty build, run or test as left out", () => {
    // Codex wrote `test:` with no value on an io track, and `build:` with none on a unit track.
    expect(parseTrackYaml(`id: c\nversion: 1\nstyles: [io]\nfiles: [main.c]\nrun: x\ntest:\ntoolchain: { packages: [x] }\n`).test).toBeUndefined();
    expect(parseTrackYaml(`id: c\nversion: 1\nstyles: [unit]\nfiles: [a]\nbuild: null\ntest: x\ntoolchain: { packages: [x] }\n`).build).toBeUndefined();
    expect(() => parseTrackYaml(`id: c\nversion: 1\nstyles: [unit]\nfiles: [a]\ntest: null\ntoolchain: { packages: [x] }\n`)).toThrow(/test/);
  });

  it.each([
    ["io without run", `id: c\nversion: 1\nstyles: [io]\nfiles: [main.c]\ntoolchain: { packages: [x] }\n`, /run/],
    ["unit without test", `id: c\nversion: 1\nstyles: [unit]\nfiles: [a]\ntoolchain: { packages: [x] }\n`, /test/],
    ["a bad id", `id: C!\nversion: 1\nstyles: [io]\nfiles: [a]\nrun: x\ntoolchain: { packages: [x] }\n`, /id/],
    ["an unsafe file path", `id: c\nversion: 1\nstyles: [io]\nfiles: [../a]\nrun: x\ntoolchain: { packages: [x] }\n`, /path/i],
    ["version 0", `id: c\nversion: 0\nstyles: [io]\nfiles: [a]\nrun: x\ntoolchain: { packages: [x] }\n`, /version/],
    ["a learner file named README.md", `id: c\nversion: 1\nstyles: [io]\nfiles: [README.md]\nrun: x\ntoolchain: { packages: [x] }\n`, /reserved/],
    ["a learner file under tests/", `id: c\nversion: 1\nstyles: [io]\nfiles: [tests/01.in]\nrun: x\ntoolchain: { packages: [x] }\n`, /reserved/],
    ["a learner file under README.md/", `id: c\nversion: 1\nstyles: [io]\nfiles: [README.md/main.sh]\nrun: x\ntoolchain: { packages: [x] }\n`, /reserved/],
    ["a file that is also a folder", `id: c\nversion: 1\nstyles: [io]\nfiles: [lib, lib/a.sh]\nrun: x\ntoolchain: { packages: [x] }\n`, /folder/],
    ["readme.md in another case", `id: c\nversion: 1\nstyles: [io]\nfiles: [readme.md]\nrun: x\ntoolchain: { packages: [x] }\n`, /reserved/],
    ["Tests/ in another case", `id: c\nversion: 1\nstyles: [io]\nfiles: [Tests/a]\nrun: x\ntoolchain: { packages: [x] }\n`, /reserved/],
    ["a version too long to reference", `id: c\nversion: 1000000000\nstyles: [io]\nfiles: [a]\nrun: x\ntoolchain: { packages: [x] }\n`, /version/],
  ])("rejects %s", (_label, yaml, error) => {
    expect(() => parseTrackYaml(yaml)).toThrow(error);
  });
});

describe("a track's toolchain block", () => {
  const yaml = (toolchain: string) => `id: py\nversion: 1\nstyles: [io]\nfiles: [main.py]\nrun: python main.py\ntoolchain:\n${toolchain}`;

  it("accepts packages, with setup and env optional", () => {
    expect(parseTrackYaml(yaml('  packages: ["python=3.13", "pytest>=8,<9"]\n  setup: npm ci\n  env: { JAVA_HOME: /opt/env/lib/jvm }\n')).toolchain).toEqual({
      packages: ["python=3.13", "pytest>=8,<9"], setup: "npm ci", env: { JAVA_HOME: "/opt/env/lib/jvm" },
    });
    expect(parseTrackYaml(yaml("  packages: [gcc]\n")).toolchain).toEqual({ packages: ["gcc"], env: {} });
  });

  it.each([
    ["no packages", "  packages: []\n", /at least one package/],
    ["a package that starts like an option", '  packages: ["--channel=evil"]\n', /match spec/],
    ["a package with a space", '  packages: ["python 3.13"]\n', /match spec/],
    ["a package from another channel", '  packages: ["evil::python"]\n', /match spec/],
    ["more than 64 packages", `  packages: [${Array.from({ length: 65 }, (_, i) => `p${i}`).join(", ")}]\n`, /at most 64/],
    ["a setup over 4 KB", `  packages: [x]\n  setup: ${"a".repeat(4097)}\n`, /4 KB/],
    ["an env name in lowercase", "  packages: [x]\n  env: { java_home: x }\n", /uppercase/],
    ["PATH in env", "  packages: [x]\n  env: { PATH: /x }\n", /sandbox sets those/],
    ["a CODE_LEARN_ name in env", "  packages: [x]\n  env: { CODE_LEARN_RUN: x }\n", /sandbox sets those/],
    ["an unknown key", "  packages: [x]\n  channels: [defaults]\n", /channels/],
  ])("refuses %s", (_, toolchain, error) => {
    expect(() => parseTrackYaml(yaml(toolchain))).toThrow(error);
  });

  it("is required", () => {
    expect(() => parseTrackYaml("id: py\nversion: 1\nstyles: [io]\nfiles: [main.py]\nrun: python main.py\n")).toThrow(/toolchain/);
  });

  it("refuses a wasi block: code-learn has no WASI engine", () => {
    expect(() => parseTrackYaml(yaml("  packages: [x]\n") + "wasi: { url: https://example.org/a.wasm, module: a.wasm }\n")).toThrow(/wasi/);
  });
});

describe("TrackRecord", () => {
  const base = { format_version: 1, id: "py", version: 1, styles: ["io"], files: ["main.py"], run: "x", limits: { time_ms: 2000, memory_mb: 256 }, installedAt: "now" };
  const toolchain = { packages: ["python=3.13"], env: {}, resolved: ["python-3.13.9-h1_0"] };

  it("reads a track's record with its toolchain and the packages it installed", () => {
    expect(TrackRecord.parse({ ...base, toolchain })).toMatchObject({ toolchain });
  });

  it("refuses a record without a toolchain, such as an older Docker or WASI record, so it reads as damaged", () => {
    expect(() => TrackRecord.parse({ ...base, image: "old-track-py:1", imageId: "sha256:x" })).toThrow();
    expect(() => TrackRecord.parse({ ...base, wasi: { sha256: "a".repeat(64), module: "python.wasm", dirs: {}, env: {} } })).toThrow();
  });
});

describe("parseRoadmapYaml", () => {
  const ok = `goal: Learn C\ntrack: c@1\nstyle: io\nconcepts:\n  - { id: c.io, title: Input, requires: [] }\n  - { id: c.loops, title: Loops, requires: [c.io] }\n`;

  it("accepts a valid roadmap", () => {
    expect(parseRoadmapYaml(ok).concepts.map((c) => c.id)).toEqual(["c.io", "c.loops"]);
  });

  it.each([
    ["an unpinned track", ok.replace("c@1", "c"), /track/],
    ["an unknown prerequisite", ok.replace("requires: [c.io]", "requires: [c.ptr]"), /c\.ptr/],
    ["duplicate ids", ok.replace("id: c.loops", "id: c.io"), /duplicate/i],
    ["a cycle", ok.replace("requires: []", "requires: [c.loops]"), /cycle/i],
    ["a repeated prerequisite", ok.replace("requires: [c.io]", "requires: [c.io, c.io]"), /more than once/],
    ["no concepts", `goal: x\ntrack: c@1\nstyle: io\nconcepts: []\n`, /concept/i],
  ])("rejects %s", (_label, yaml, error) => {
    expect(() => parseRoadmapYaml(yaml)).toThrow(error);
  });

  it("rejects oversized input before parsing", () => {
    expect(() => parseRoadmapYaml(`# ${"x".repeat(70_000)}`)).toThrow(/64 KB/);
  });
});

describe("parseExerciseYaml", () => {
  it("accepts a minimal exercise", () => {
    expect(parseExerciseYaml(`slug: sum\nconcepts: [c.io]\ndifficulty: 2\n`)).toMatchObject({ slug: "sum", difficulty: 2 });
  });

  it.each([
    ["difficulty 4", `slug: sum\nconcepts: [c.io]\ndifficulty: 4\n`],
    ["no concepts", `slug: sum\nconcepts: []\ndifficulty: 1\n`],
    ["an unknown style", `slug: sum\nconcepts: [c.io]\ndifficulty: 1\nstyle: gui\n`],
    ["a repeated concept", `slug: sum\nconcepts: [c.io, c.io]\ndifficulty: 1\n`],
  ])("rejects %s", (_label, yaml) => {
    expect(() => parseExerciseYaml(yaml)).toThrow();
  });
});

describe("roadmap title", () => {
  const base = "goal: G\ntrack: c@1\nstyle: io\nconcepts:\n  - { id: a, title: A, requires: [] }\n";

  it("accepts a short display title, and none at all", () => {
    expect(parseRoadmapYaml(base).title).toBeUndefined();
    expect(parseRoadmapYaml(`title: Spring Boot\n${base}`).title).toBe("Spring Boot");
  });

  it.each([
    ["an empty title", 'title: ""\n'],
    ["a blank title", 'title: "  "\n'],
    ["a title over 60 characters", `title: "${"t".repeat(61)}"\n`],
  ])("rejects %s", (_label, line) => {
    expect(() => parseRoadmapYaml(`${line}${base}`)).toThrow(/title/);
  });
});

describe("roadmap practice note", () => {
  const base = "goal: G\ntrack: c@1\nstyle: io\nconcepts:\n  - { id: a, title: A, requires: [] }\n";

  it("accepts a short note on why code practice may not fit, and none at all", () => {
    expect(parseRoadmapYaml(base).practice_note).toBeUndefined();
    expect(parseRoadmapYaml(`${base}practice_note: A quiz judges prompts better.\n`).practice_note).toBe("A quiz judges prompts better.");
  });

  it("rejects a note over 300 characters", () => {
    expect(() => parseRoadmapYaml(`${base}practice_note: ${"n".repeat(301)}\n`)).toThrow(/practice_note/);
  });
});

describe("roadmap sources", () => {
  const base = "goal: G\ntrack: c@1\nstyle: io\nconcepts:\n  - { id: a, title: A, requires: [] }\n";
  const withSources = (items: string) => `${base}sources:\n${items}`;

  it("accepts up to 10 https sources with short titles, and none at all", () => {
    expect(parseRoadmapYaml(base).sources).toBeUndefined();
    const r = parseRoadmapYaml(withSources('  - { title: "MDN: Loops", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration" }\n'));
    expect(r.sources).toEqual([{ title: "MDN: Loops", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration" }]);
  });

  it.each([
    ["an http link", '  - { title: T, url: "http://example.com" }\n', /https/],
    ["a javascript: link", '  - { title: T, url: "javascript:alert(1)" }\n', /https/],
    ["a link with credentials", '  - { title: T, url: "https://user:pw@example.com" }\n', /https/],
    ["a title over 120 characters", `  - { title: "${"t".repeat(121)}", url: "https://example.com" }\n`, /title/],
    ["more than 10 sources", '  - { title: T, url: "https://example.com" }\n'.repeat(11), /sources/],
    ["an unknown key", '  - { title: T, url: "https://example.com", note: x }\n', /note|Unrecognized/i],
  ])("rejects %s", (_label, items, error) => {
    expect(() => parseRoadmapYaml(withSources(items))).toThrow(error);
  });
});

describe("roadmap practice and sources", () => {
  const source = { title: "Guide", url: "https://example.com/guide" };
  const yaml = (fields: Record<string, unknown>, sources?: typeof source[]) => JSON.stringify({
    goal: "G", track: "custom@1", style: "io", concepts: [{ id: "a", title: "A", ...fields }], sources,
  });

  it("keeps optional practice, pitfalls and source refs, trimming practice", () => {
    expect(parseRoadmapYaml(yaml({ practice: "  Fix a retry loop  ", pitfalls: ["No retry budget"], refs: [0] }, [source])).concepts[0])
      .toEqual({ id: "a", title: "A", requires: [], practice: "Fix a retry loop", pitfalls: ["No retry budget"], refs: [0] });
  });

  it("accepts the limits and all ten distinct source refs", () => {
    const fields = { practice: "p".repeat(300), pitfalls: Array(5).fill("p".repeat(200)), refs: Array.from({ length: 10 }, (_, i) => i) };
    expect(parseRoadmapYaml(yaml(fields, Array(10).fill(source))).concepts[0]).toMatchObject(fields);
  });

  it.each([undefined, []])("allows practice without refs when there are no sources (%s)", (sources) => {
    expect(parseRoadmapYaml(yaml({ practice: "Fix a loop", pitfalls: [] }, sources)).concepts[0]).toMatchObject({ practice: "Fix a loop", pitfalls: [] });
  });

  it.each([
    { practice: "" }, { practice: "  " }, { practice: "p".repeat(301) },
    { pitfalls: [""] }, { pitfalls: ["p".repeat(201)] }, { pitfalls: Array(6).fill("p") },
    { refs: [-1] }, { refs: [0.5] }, { refs: ["0"] }, { refs: [0, 0] }, { refs: Array.from({ length: 11 }, (_, i) => i) },
    { extra: "unknown" },
  ])("rejects invalid concept fields %j", (fields) => {
    expect(() => parseRoadmapYaml(yaml(fields, Array(10).fill(source)))).toThrow(/Invalid roadmap:/);
  });

  it.each([undefined, [], [source]])("rejects out-of-range refs (%j)", (sources) => {
    expect(() => parseRoadmapYaml(yaml({ refs: [sources?.length ?? 0] }, sources))).toThrow(/Invalid roadmap:.*ref.*range/);
  });

  it("allows empty pitfalls without refs when sources exist", () => {
    expect(parseRoadmapYaml(yaml({ pitfalls: [] }, [source])).concepts[0]).toMatchObject({ pitfalls: [] });
  });

  it.each([{ practice: "Fix a loop" }, { pitfalls: ["No budget"] }, { practice: "Fix a loop", refs: [] }])
    ("requires refs for practice or pitfalls with sources (%j)", (fields) => {
      expect(() => parseRoadmapYaml(yaml(fields, [source]))).toThrow(/Invalid roadmap:.*ref/);
    });
});

describe("lesson examples", () => {
  const fence = (n: number) => "```example\n" + n + "\n```";
  const lesson = (body: string, examples?: Record<string, string>[]) => ({ id: "l", concept: "c", title: "L", ...lessonFields(body), ...(examples ? { examples } : {}) });
  const ex = { "main.sh": "echo hi\n" };

  it("finds example references: a fenced block with info string example and the example's number", () => {
    expect(exampleRefs(`Intro\n\n${fence(1)}\n\nThen\n\n${fence(2)}\n`)).toEqual([1, 2]);
    expect(exampleRefs("```sh\necho 1\n```")).toEqual([]);
  });

  it("counts only top-level example fences: not one shown inside another fence or indented, and tildes work too", () => {
    expect(exampleRefs("````md\n```example\n1\n```\n````\n")).toEqual([]);
    expect(exampleRefs("    ```example\n    1\n    ```\n")).toEqual([]);
    expect(exampleRefs("~~~example\n2\n~~~\n")).toEqual([2]);
  });

  // The app's renderer pins the same cases (desktop ui/Markdown.test.tsx): both use markdown-it's tokens.
  it.each([
      ["- item\n  ~~~text\n  code\n\n~~~example\n1\n~~~", [1]],
      ["~~~example\n1\n~~~\u00a0", []],
      ["~~~example\r1\r~~~", [1]],
      ["```example\n\n1\n\n```\n", []],
      ["```example\n1\n", []],
      ["   ````md\n```example\n1\n```\n   ````\n", []],
    ])("finds the same example blocks as the app in %j", (text, refs) => {
    expect(exampleRefs(text as string)).toEqual(refs);
  });

  it("accepts examples that are each referenced", () => {
    expect(parseLesson(lesson(`See:\n\n${fence(1)}\n`, [ex])).examples).toEqual([ex]);
    expect(parseLesson(lesson("No examples")).examples).toBeUndefined();
  });

  it.each([
    ["a reference to a missing example", lesson(`${fence(2)}\n`, [ex]), /example 2/],
    ["an example the markdown never places", lesson("Text only", [ex]), /example 1/],
    ["more than 5 examples", lesson([1, 2, 3, 4, 5, 6].map(fence).join("\n\n"), Array(6).fill(ex)), /5/],
    ["an example over 64 KB", lesson(`${fence(1)}\n`, [{ "main.sh": "x".repeat(65_537) }]), /64 KB/],
    ["more than 250 example files in all", lesson(`${fence(1)}\n\n${fence(2)}\n`, [1, 2].map((e) => Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`tests/t${e}-${i}.sh`, "x"])))), /250 files/],
  ])("refuses %s", (_label, input, error) => {
    expect(() => parseLesson(input)).toThrow(error);
  });
});

describe("lesson diagrams", () => {
  const lesson = (body: string, examples?: Record<string, string>[]) => ({ id: "l", concept: "c", title: "L", ...lessonFields(body), ...(examples ? { examples } : {}) });
  const diagram = "```mermaid\nflowchart TD\n  A --> B\n```";

  // The text is checked for structure only: the app draws a diagram, and shows its source if it can't (desktop §4.3).
  it("accepts diagram fences without parsing or drawing them", () => {
    expect(parseLesson(lesson(`Before\n\n${diagram}\n\nAfter`)).markdown).toContain("flowchart TD");
    expect(parseLesson(lesson("```mermaid\nthis is not a diagram\n```")).title).toBe("L");
    expect(parseLesson(lesson(`~~~mermaid\npie\n  "a" : 1\n~~~`)).id).toBe("l");
  });

  it("keeps diagrams and runnable examples apart", () => {
    const text = `${diagram}\n\n\`\`\`example\n1\n\`\`\`\n`;
    expect(exampleRefs(text)).toEqual([1]);
    expect(parseLesson(lesson(text, [{ "main.sh": "echo hi\n" }])).examples).toHaveLength(1);
    // A diagram whose only line is a number is still a diagram, not an example.
    expect(() => parseLesson(lesson("```mermaid\n1\n```", [{ "main.sh": "echo hi\n" }]))).toThrow(/example 1 is never placed/);
  });
});

describe("course styles", () => {
  const yaml = (style: string) => `goal: Learn\nstyle: ${style}\nconcepts: [{ id: a, title: A }]\n`;
  it("accepts lessons only with or without a retained track", () => {
    expect(parseRoadmapYaml(yaml("none")).track).toBeUndefined();
    expect(parseRoadmapYaml(yaml("none") + "track: example@1\n").track).toBe("example@1");
  });
  it.each(["io", "unit"])("requires a track for %s", (style) => {
    expect(() => parseRoadmapYaml(yaml(style))).toThrow(/track/);
  });
  it("keeps none out of exercise styles", () => {
    expect(() => parseExerciseYaml("slug: e\nstyle: none\nconcepts: [a]\ndifficulty: 1")).toThrow();
  });
});

describe("mixed course style", () => {
  const mixed = (track = "track: example@1\n") => `goal: Learn\nstyle: both\n${track}concepts: [{ id: a, title: A }]\n`;
  const course = (style: string, formatVersion: number, track = "example@1") => ({
    format_version: formatVersion, course: "c", ...parseRoadmapYaml(`goal: Learn\nstyle: ${style}\ntrack: ${track}\nconcepts: [{ id: a, title: A }]\n`),
  });
  it("requires a track, like a code course", () => {
    expect(parseRoadmapYaml(mixed()).style).toBe("both");
    expect(() => parseRoadmapYaml(mixed(""))).toThrow(/track/);
  });
  it("is written as format 2 and read only as format 2; version 1 courses still load", () => {
    expect(CourseRecord.parse(course("both", 2))).toMatchObject({ style: "both", track: "example@1" });
    expect(() => CourseRecord.parse(course("both", 1))).toThrow();
    expect(() => CourseRecord.parse(course("io", 2))).toThrow();
    expect(CourseRecord.parse(course("io", 1))).toMatchObject({ style: "io" });
    expect(CourseRecord.parse(course("none", 1))).toMatchObject({ style: "none" });
  });
  it("runs code exercises in the track's first style", () => {
    expect(codeStyleOf("both", { styles: ["unit", "io"] })).toBe("unit");
    expect(codeStyleOf("io", { styles: ["unit"] })).toBe("io");
    expect(codeStyleOf("none", { styles: ["io"] })).toBe("io");
  });
});

describe("lesson parts", () => {
  const lesson = (fields: object) => ({ id: "l", concept: "c", title: "L", ...lessonFields("Body."), ...fields });

  // Fixed headings made every lesson the same recipe, whatever its subject needed.
  it("leaves the lesson's text and headings to its writer", () => {
    expect(parseLesson(lesson({ markdown: "## When the rules and the Act disagree\n\nThe Act wins." })).id).toBe("l");
  });

  // A heading named after its role brings the old recipe back under its own names, and tells a scanning learner nothing.
  it("refuses a ## heading named after its role in the lesson", () => {
    for (const heading of ["Examples", "Common mistakes", "Pitfall: over-specifying steps", "Worked example", "Steps", "Summary"]) {
      expect(() => parseLesson(lesson({ markdown: `## ${heading}\n\nText.` }))).toThrow(/names a part of the lesson/);
    }
    expect(parseLesson(lesson({ markdown: "## Finding the keys, step by step\n\nText.\n\n## Why the sample data misleads you\n\nText." })).id).toBe("l");
  });

  it("needs a goal and one to three self-check questions, each with an answer", () => {
    expect(() => parseLesson(lesson({ goal: undefined }))).toThrow(/goal/);
    expect(() => parseLesson(lesson({ selfCheck: [] }))).toThrow(/selfCheck/);
    const four = Array.from({ length: 4 }, () => LESSON_FRAME.selfCheck[0]);
    expect(() => parseLesson(lesson({ selfCheck: four }))).toThrow(/selfCheck/);
    expect(() => parseLesson(lesson({ selfCheck: [{ question: "Why?" }] }))).toThrow(/answer/);
  });
});
